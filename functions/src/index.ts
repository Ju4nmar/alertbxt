import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { logger } from 'firebase-functions/v2';

initializeApp();

const FCM_MULTICAST_LIMIT = 500;
const RECORDATORIO_MAX_DELAY_MS = 24 * 24 * 60 * 60 * 1000;

const TIPO_TITULOS: Record<string, string> = {
  alerta: 'Alerta SOS',
  emergencia: 'Nueva alerta',
  mantenimiento: 'Nuevo aviso de mantenimiento',
  informativo: 'Nuevo aviso',
};

interface AvisoData {
  tituloAviso?: string;
  tipoAviso?: string;
  comunidadId?: string;
  autorId?: string;
}

interface TokenRef {
  idUsuario: string;
  token: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export const onAvisoCreado = onDocumentCreated('avisos/{avisoId}', async event => {
  const snapshot = event.data;
  if (!snapshot) {
    return;
  }

  const aviso = snapshot.data() as AvisoData;
  const comunidadId = aviso.comunidadId;
  if (!comunidadId) {
    logger.warn('Aviso sin comunidadId, se omite el envio de push', { avisoId: event.params.avisoId });
    return;
  }

  const db = getFirestore();

  const usuariosSnap = await db.collection('usuarios')
    .where('comunidadId', '==', comunidadId)
    .where('activo', '==', true)
    .get();

  const destinatarios = usuariosSnap.docs.filter(doc => doc.id !== aviso.autorId);
  if (!destinatarios.length) {
    return;
  }

  const tokenRefs: TokenRef[] = [];
  await Promise.all(destinatarios.map(async usuarioDoc => {
    const dispositivosSnap = await usuarioDoc.ref.collection('dispositivos').get();
    dispositivosSnap.docs.forEach(dispositivoDoc => {
      tokenRefs.push({ idUsuario: usuarioDoc.id, token: dispositivoDoc.id });
    });
  }));

  if (!tokenRefs.length) {
    return;
  }

  const titulo = TIPO_TITULOS[aviso.tipoAviso || ''] || 'Nuevo aviso';
  const cuerpo = aviso.tituloAviso || 'Toca para ver los detalles.';
  const messaging = getMessaging();

  for (const tokenChunk of chunk(tokenRefs, FCM_MULTICAST_LIMIT)) {
    const response = await messaging.sendEachForMulticast({
      tokens: tokenChunk.map(ref => ref.token),
      notification: {
        title: titulo,
        body: cuerpo,
      },
      data: {
        avisoId: event.params.avisoId,
        tipoAviso: aviso.tipoAviso || '',
        comunidadId,
      },
      webpush: {
        fcmOptions: { link: '/alertas-eventos' },
      },
    });

    await Promise.all(response.responses.map(async (result, index) => {
      if (result.success) {
        return;
      }

      const code = result.error?.code;
      if (code !== 'messaging/registration-token-not-registered' && code !== 'messaging/invalid-registration-token') {
        logger.error('Error enviando push a un dispositivo', { code, message: result.error?.message });
        return;
      }

      const tokenRef = tokenChunk[index];
      await db.doc(`usuarios/${tokenRef.idUsuario}/dispositivos/${tokenRef.token}`).delete();
    }));
  }

  logger.info('Push de aviso enviado', {
    avisoId: event.params.avisoId,
    comunidadId,
    destinatarios: tokenRefs.length,
  });
});

interface RecordatorioData {
  tituloRecordatorio?: string;
  fechaHora?: string;
  idUsuario?: string;
  estado?: string;
}

interface RecordatorioTaskPayload {
  idRecordatorio: string;
  fechaHoraEsperada: string;
}

// Programa (o reprograma) el envio del push de un recordatorio cuando se crea
// o cuando cambia su fechaHora. No cancela tareas viejas explicitamente: la
// tarea disparada compara la fechaHora esperada contra la actual y se
// descarta sola si el recordatorio fue editado o eliminado mientras tanto.
export const onRecordatorioWrite = onDocumentWritten('recordatorios/{recordatorioId}', async event => {
  const after = event.data?.after;
  if (!after?.exists) {
    return;
  }

  const data = after.data() as RecordatorioData;
  const before = event.data?.before;
  const beforeData = before?.exists ? before.data() as RecordatorioData : undefined;

  if (beforeData?.fechaHora === data.fechaHora) {
    return;
  }

  if (!data.fechaHora || !data.idUsuario) {
    return;
  }

  const fechaHora = new Date(data.fechaHora);
  const delayMs = fechaHora.getTime() - Date.now();

  if (Number.isNaN(fechaHora.getTime()) || delayMs < 0 || delayMs > RECORDATORIO_MAX_DELAY_MS) {
    return;
  }

  if (data.estado === 'completado') {
    await after.ref.update({ estado: 'pendiente' });
  }

  const queue = getFunctions().taskQueue<RecordatorioTaskPayload>('enviarRecordatorioPush');
  await queue.enqueue(
    { idRecordatorio: event.params.recordatorioId, fechaHoraEsperada: data.fechaHora },
    { scheduleTime: fechaHora }
  );
});

export const enviarRecordatorioPush = onTaskDispatched<RecordatorioTaskPayload>(
  {
    retryConfig: { maxAttempts: 2, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 6 },
  },
  async request => {
    const { idRecordatorio, fechaHoraEsperada } = request.data;
    const db = getFirestore();
    const ref = db.doc(`recordatorios/${idRecordatorio}`);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return;
    }

    const data = snapshot.data() as RecordatorioData;
    if (data.estado === 'completado' || data.fechaHora !== fechaHoraEsperada || !data.idUsuario) {
      return;
    }

    const dispositivosSnap = await db.collection(`usuarios/${data.idUsuario}/dispositivos`).get();
    const tokens = dispositivosSnap.docs.map(doc => doc.id);

    if (tokens.length) {
      const messaging = getMessaging();
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: 'Recordatorio',
          body: data.tituloRecordatorio || 'Tienes un recordatorio pendiente.',
        },
        data: { recordatorioId: idRecordatorio },
        webpush: {
          fcmOptions: { link: '/recordatorios' },
        },
      });

      await Promise.all(response.responses.map(async (result, index) => {
        if (result.success) {
          return;
        }

        const code = result.error?.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          await db.doc(`usuarios/${data.idUsuario}/dispositivos/${tokens[index]}`).delete();
        }
      }));
    }

    await ref.update({ estado: 'completado' });
  }
);
