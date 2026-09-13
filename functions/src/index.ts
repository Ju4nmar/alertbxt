import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

initializeApp();

const FCM_MULTICAST_LIMIT = 500;

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
