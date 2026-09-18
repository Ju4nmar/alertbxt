import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
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

interface ComunidadData {
  codigoInvitacion?: string;
  nombreComunidad?: string;
  tipoComunidad?: 'apartamentos' | 'casas';
}

// Mantiene codigos_invitacion/{codigo} en sincronía con comunidades: es lo
// que getComunidadByCodigoInvitacion() lee para validar un código ANTES de
// que el residente nuevo se autentique (ver comentario en
// FirestoreService), así que no puede depender de una escritura del
// cliente que se puede saltar u olvidar — la maneja el propio backend con
// privilegios de administrador, siempre, para toda comunidad.
export const onComunidadWrite = onDocumentWritten('comunidades/{comunidadId}', async event => {
  const after = event.data?.after;
  if (!after?.exists) {
    return;
  }

  const data = after.data() as ComunidadData;
  if (!data.codigoInvitacion || !data.nombreComunidad) {
    return;
  }

  // Sin optimización de "solo si cambió": así cualquier escritura futura al
  // documento (incluida una edición no relacionada) también sirve para
  // sincronizar retroactivamente comunidades que existían antes de esta
  // función, sin necesitar una migración aparte.
  const db = getFirestore();
  const codigoDoc: Record<string, unknown> = {
    comunidadId: event.params.comunidadId,
    nombreComunidad: data.nombreComunidad,
  };
  if (data.tipoComunidad) {
    codigoDoc['tipoComunidad'] = data.tipoComunidad;
  }
  await db.doc(`codigos_invitacion/${data.codigoInvitacion}`).set(codigoDoc);

  logger.info('codigos_invitacion sincronizado', { comunidadId: event.params.comunidadId, codigo: data.codigoInvitacion });
});

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

interface UsuarioData {
  nombre?: string;
  rol?: string;
  comunidadId?: string;
}

interface EnviarMensajeIndividualRequest {
  destinatarioId?: string;
  mensaje?: string;
}

const MENSAJE_MAX_LENGTH = 500;

// Callable en vez de trigger de Firestore a propósito: es síncrona, se
// invoca directo desde el cliente y su resultado (éxito o error) es
// inmediato — sin la capa de Eventarc/Pub-Sub que dejó a onComunidadWrite
// sin dispararse nunca en producción (ver ese comentario más arriba).
export const enviarMensajeIndividual = onCall<EnviarMensajeIndividualRequest>(async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const destinatarioId = request.data.destinatarioId;
  const mensaje = (request.data.mensaje || '').trim();

  if (!destinatarioId || !mensaje) {
    throw new HttpsError('invalid-argument', 'Falta el destinatario o el mensaje.');
  }

  if (mensaje.length > MENSAJE_MAX_LENGTH) {
    throw new HttpsError('invalid-argument', `El mensaje no debe superar ${MENSAJE_MAX_LENGTH} caracteres.`);
  }

  const db = getFirestore();
  const [autorSnap, destinatarioSnap] = await Promise.all([
    db.doc(`usuarios/${uid}`).get(),
    db.doc(`usuarios/${destinatarioId}`).get(),
  ]);

  const autor = autorSnap.data() as UsuarioData | undefined;
  const destinatario = destinatarioSnap.data() as UsuarioData | undefined;

  if (!autor || autor.rol !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo un administrador puede enviar mensajes individuales.');
  }

  if (!destinatario) {
    throw new HttpsError('not-found', 'El destinatario no existe.');
  }

  if (!autor.comunidadId || destinatario.comunidadId !== autor.comunidadId) {
    throw new HttpsError('permission-denied', 'El destinatario no pertenece a tu comunidad.');
  }

  const mensajeDoc = {
    autorId: uid,
    autorNombre: autor.nombre || 'Administrador',
    mensaje,
    fecha: new Date().toISOString(),
  };

  const mensajeRef = await db.collection(`usuarios/${destinatarioId}/mensajes_admin`).add(mensajeDoc);

  const dispositivosSnap = await db.collection(`usuarios/${destinatarioId}/dispositivos`).get();
  const tokens = dispositivosSnap.docs.map(doc => doc.id);

  if (tokens.length) {
    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `Mensaje de ${mensajeDoc.autorNombre}`,
        body: mensaje,
      },
      data: { mensajeId: mensajeRef.id, tipo: 'mensaje_individual' },
      webpush: {
        fcmOptions: { link: '/mensajes' },
      },
    });

    await Promise.all(response.responses.map(async (result, index) => {
      if (result.success) {
        return;
      }

      const code = result.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        await db.doc(`usuarios/${destinatarioId}/dispositivos/${tokens[index]}`).delete();
      }
    }));
  }

  logger.info('Mensaje individual enviado', { mensajeId: mensajeRef.id, destinatarioId, autorId: uid });

  return { mensajeId: mensajeRef.id };
});
