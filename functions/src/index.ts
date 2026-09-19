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
  descripcionAviso?: string;
  ubicacionAviso?: string;
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
  // En una alerta SOS el título es siempre "Alerta SOS": lo útil es el tipo
  // de emergencia y dónde ocurre (torre y apartamento).
  const cuerpo = aviso.tipoAviso === 'alerta' && aviso.descripcionAviso
    ? [aviso.descripcionAviso, aviso.ubicacionAviso].filter(Boolean).join(' · ')
    : aviso.tituloAviso || 'Toca para ver los detalles.';
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
  usuariosAsignados?: string[];
  paraTodaLaComunidad?: boolean;
  comunidadId?: string;
  estado?: string;
}

function tieneDestinatario(data: RecordatorioData): boolean {
  return !!data.idUsuario || !!data.usuariosAsignados?.length || !!data.paraTodaLaComunidad;
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

  if (!data.fechaHora || !tieneDestinatario(data)) {
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
    if (data.estado === 'completado' || data.fechaHora !== fechaHoraEsperada || !tieneDestinatario(data)) {
      return;
    }

    let destinatarioIds: string[];
    if (data.paraTodaLaComunidad && data.comunidadId) {
      const usuariosSnap = await db.collection('usuarios')
        .where('comunidadId', '==', data.comunidadId)
        .where('activo', '==', true)
        .get();
      destinatarioIds = usuariosSnap.docs.map(doc => doc.id);
    } else if (data.usuariosAsignados?.length) {
      destinatarioIds = data.usuariosAsignados;
    } else {
      destinatarioIds = data.idUsuario ? [data.idUsuario] : [];
    }

    const tokenRefs: TokenRef[] = [];
    await Promise.all(destinatarioIds.map(async id => {
      const dispositivosSnap = await db.collection(`usuarios/${id}/dispositivos`).get();
      dispositivosSnap.docs.forEach(doc => tokenRefs.push({ idUsuario: id, token: doc.id }));
    }));

    if (tokenRefs.length) {
      const messaging = getMessaging();
      for (const tokenChunk of chunk(tokenRefs, FCM_MULTICAST_LIMIT)) {
        const response = await messaging.sendEachForMulticast({
          tokens: tokenChunk.map(ref => ref.token),
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
            const tokenRef = tokenChunk[index];
            await db.doc(`usuarios/${tokenRef.idUsuario}/dispositivos/${tokenRef.token}`).delete();
          }
        }));
      }
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
  destinatarioIds?: string[];
  mensaje?: string;
}

const MENSAJE_MAX_LENGTH = 500;
const MAX_DESTINATARIOS = 50;

// Callable en vez de trigger de Firestore a propósito: es síncrona, se
// invoca directo desde el cliente y su resultado (éxito o error) es
// inmediato — sin la capa de Eventarc/Pub-Sub que dejó a onComunidadWrite
// sin dispararse nunca en producción (ver ese comentario más arriba).
export const enviarMensajeIndividual = onCall<EnviarMensajeIndividualRequest>(async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const destinatarioIds = Array.from(new Set((request.data.destinatarioIds || []).filter(Boolean)));
  const mensaje = (request.data.mensaje || '').trim();

  if (!destinatarioIds.length || !mensaje) {
    throw new HttpsError('invalid-argument', 'Falta el destinatario o el mensaje.');
  }

  if (destinatarioIds.length > MAX_DESTINATARIOS) {
    throw new HttpsError('invalid-argument', `No puedes enviar a más de ${MAX_DESTINATARIOS} vecinos a la vez.`);
  }

  if (mensaje.length > MENSAJE_MAX_LENGTH) {
    throw new HttpsError('invalid-argument', `El mensaje no debe superar ${MENSAJE_MAX_LENGTH} caracteres.`);
  }

  const db = getFirestore();
  const autorSnap = await db.doc(`usuarios/${uid}`).get();
  const autor = autorSnap.data() as UsuarioData | undefined;

  if (!autor || autor.rol !== 'admin' || !autor.comunidadId) {
    throw new HttpsError('permission-denied', 'Solo un administrador puede enviar mensajes individuales.');
  }

  const destinatarioSnaps = await Promise.all(destinatarioIds.map(id => db.doc(`usuarios/${id}`).get()));
  const destinatariosValidos: { id: string; nombre: string }[] = [];
  destinatarioSnaps.forEach((snap, index) => {
    const data = snap.data() as UsuarioData | undefined;
    if (data && data.comunidadId === autor.comunidadId) {
      destinatariosValidos.push({ id: destinatarioIds[index], nombre: data.nombre || 'Vecino' });
    }
  });

  if (!destinatariosValidos.length) {
    throw new HttpsError('not-found', 'Ningún destinatario válido pertenece a tu comunidad.');
  }

  const fecha = new Date().toISOString();
  const autorNombre = autor.nombre || 'Administrador';

  // A cada destinatario le corresponde un mensajeId propio en su
  // usuarios/{id}/mensajes_admin (autogenerado, distinto del mensajeEnviadoId
  // del remitente). Se guarda aquí junto al nombre para que, desde
  // "Enviados", el admin pueda abrir el hilo de respuestas de cada
  // destinatario sin tener que adivinar o buscar ese id.
  const batch = db.batch();
  const mensajeEnviadoRef = db.collection(`usuarios/${uid}/mensajes_enviados`).doc();
  const destinatariosConMensajeId = destinatariosValidos.map(destinatario => ({
    ...destinatario,
    mensajeId: db.collection(`usuarios/${destinatario.id}/mensajes_admin`).doc().id,
  }));
  batch.set(mensajeEnviadoRef, { destinatarios: destinatariosConMensajeId, mensaje, fecha });
  destinatariosConMensajeId.forEach(destinatario => {
    const ref = db.doc(`usuarios/${destinatario.id}/mensajes_admin/${destinatario.mensajeId}`);
    batch.set(ref, { autorId: uid, autorNombre, mensaje, fecha });
  });
  await batch.commit();

  const tokenRefs: TokenRef[] = [];
  await Promise.all(destinatariosValidos.map(async destinatario => {
    const dispositivosSnap = await db.collection(`usuarios/${destinatario.id}/dispositivos`).get();
    dispositivosSnap.docs.forEach(doc => tokenRefs.push({ idUsuario: destinatario.id, token: doc.id }));
  }));

  if (tokenRefs.length) {
    const messaging = getMessaging();
    for (const tokenChunk of chunk(tokenRefs, FCM_MULTICAST_LIMIT)) {
      const response = await messaging.sendEachForMulticast({
        tokens: tokenChunk.map(ref => ref.token),
        notification: {
          title: `Mensaje de ${autorNombre}`,
          body: mensaje,
        },
        data: { tipo: 'mensaje_individual' },
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
          const tokenRef = tokenChunk[index];
          await db.doc(`usuarios/${tokenRef.idUsuario}/dispositivos/${tokenRef.token}`).delete();
        }
      }));
    }
  }

  logger.info('Mensaje individual enviado', {
    mensajeEnviadoId: mensajeEnviadoRef.id,
    destinatarios: destinatariosValidos.map(d => d.id),
    autorId: uid,
  });

  return { mensajeId: mensajeEnviadoRef.id, enviados: destinatariosValidos.length };
});

interface ResponderMensajeRequest {
  mensajeId?: string;
  texto?: string;
}

const RESPUESTA_MAX_LENGTH = 500;

// Solo el residente dueño del mensaje puede responder aquí (no hay una
// función equivalente para que el admin conteste dentro del mismo hilo: si
// quiere seguir la conversación usa "Enviar mensaje" de nuevo, que abre un
// mensaje nuevo). Igual que enviarMensajeIndividual, escribe con el SDK de
// administrador para no depender de una regla de Firestore que valide la
// pertenencia del mensaje original desde el cliente.
export const responderMensajeAdmin = onCall<ResponderMensajeRequest>(async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const mensajeId = (request.data.mensajeId || '').trim();
  const texto = (request.data.texto || '').trim();

  if (!mensajeId || !texto) {
    throw new HttpsError('invalid-argument', 'Falta el mensaje original o el texto de la respuesta.');
  }

  if (texto.length > RESPUESTA_MAX_LENGTH) {
    throw new HttpsError('invalid-argument', `La respuesta no debe superar ${RESPUESTA_MAX_LENGTH} caracteres.`);
  }

  const db = getFirestore();
  const mensajeRef = db.doc(`usuarios/${uid}/mensajes_admin/${mensajeId}`);
  const mensajeSnap = await mensajeRef.get();
  const mensajeOriginal = mensajeSnap.data() as { autorId?: string } | undefined;

  if (!mensajeOriginal?.autorId) {
    throw new HttpsError('not-found', 'No se encontró el mensaje original.');
  }

  const residenteSnap = await db.doc(`usuarios/${uid}`).get();
  const residente = residenteSnap.data() as UsuarioData | undefined;
  const autorNombre = residente?.nombre || 'Vecino';
  const fecha = new Date().toISOString();

  // Además del hilo (bajo el mensaje del residente), la respuesta llega a la
  // bandeja "Recibidos" del admin como un mensaje más, marcado esRespuesta,
  // para que la vea junto al resto sin tener que abrir "Enviados".
  const respuestaRef = mensajeRef.collection('respuestas').doc();
  const batch = db.batch();
  batch.set(respuestaRef, { autorId: uid, autorNombre, texto, fecha, esAdmin: false });
  batch.set(db.collection(`usuarios/${mensajeOriginal.autorId}/mensajes_admin`).doc(), {
    autorId: uid,
    autorNombre,
    mensaje: texto,
    fecha,
    esRespuesta: true,
    enRespuestaA: mensajeId,
  });
  await batch.commit();

  const dispositivosSnap = await db.collection(`usuarios/${mensajeOriginal.autorId}/dispositivos`).get();
  const tokens = dispositivosSnap.docs.map(doc => doc.id);

  if (tokens.length) {
    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `${autorNombre} respondió tu mensaje`,
        body: texto,
      },
      data: { tipo: 'respuesta_mensaje' },
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
        await db.doc(`usuarios/${mensajeOriginal.autorId}/dispositivos/${tokens[index]}`).delete();
      }
    }));
  }

  logger.info('Respuesta a mensaje individual enviada', {
    mensajeId,
    autorId: uid,
    destinatarioId: mensajeOriginal.autorId,
  });

  return { respuestaId: respuestaRef.id };
});

interface CrearRecordatorioAsignadoRequest {
  titulo?: string;
  descripcion?: string;
  fechaHora?: string;
  usuarioIds?: string[];
  paraTodos?: boolean;
}

const RECORDATORIO_TITULO_MIN = 3;
const RECORDATORIO_TITULO_MAX = 80;
const RECORDATORIO_DESC_MIN = 5;
const RECORDATORIO_DESC_MAX = 300;
const MAX_ASIGNADOS_RECORDATORIO = 200;

// Crea UN solo recordatorio compartido (no una copia por destinatario, a
// diferencia de enviarMensajeIndividual): "completado" ya es automático —
// lo pone enviarRecordatorioPush cuando llega la fecha, igual que en los
// recordatorios personales — así que no hace falta rastrear el progreso de
// cada destinatario por separado, ni duplicar el documento.
export const crearRecordatorioAsignado = onCall<CrearRecordatorioAsignadoRequest>(async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const titulo = (request.data.titulo || '').trim();
  const descripcion = (request.data.descripcion || '').trim();
  const fechaHoraTexto = request.data.fechaHora || '';
  const paraTodos = !!request.data.paraTodos;
  const usuarioIds = Array.from(new Set((request.data.usuarioIds || []).filter(Boolean)));

  if (!titulo || !descripcion || !fechaHoraTexto) {
    throw new HttpsError('invalid-argument', 'Completa título, descripción y fecha.');
  }

  if (titulo.length < RECORDATORIO_TITULO_MIN || titulo.length > RECORDATORIO_TITULO_MAX) {
    throw new HttpsError('invalid-argument', 'Revisa la longitud del título.');
  }

  if (descripcion.length < RECORDATORIO_DESC_MIN || descripcion.length > RECORDATORIO_DESC_MAX) {
    throw new HttpsError('invalid-argument', 'Revisa la longitud de la descripción.');
  }

  if (!paraTodos && !usuarioIds.length) {
    throw new HttpsError('invalid-argument', 'Selecciona al menos un vecino, o marca "Todos".');
  }

  if (usuarioIds.length > MAX_ASIGNADOS_RECORDATORIO) {
    throw new HttpsError('invalid-argument', `No puedes asignar a más de ${MAX_ASIGNADOS_RECORDATORIO} vecinos a la vez.`);
  }

  const fechaHora = new Date(fechaHoraTexto);
  if (Number.isNaN(fechaHora.getTime()) || fechaHora.getTime() < Date.now()) {
    throw new HttpsError('invalid-argument', 'La fecha y hora del recordatorio deben ser futuras.');
  }

  const db = getFirestore();
  const autorSnap = await db.doc(`usuarios/${uid}`).get();
  const autor = autorSnap.data() as UsuarioData | undefined;

  if (!autor || autor.rol !== 'admin' || !autor.comunidadId) {
    throw new HttpsError('permission-denied', 'Solo un administrador puede asignar recordatorios a otros vecinos.');
  }

  const recordatorioData: Record<string, unknown> = {
    tituloRecordatorio: titulo,
    descripcionRecordatorio: descripcion,
    fechaHora: fechaHora.toISOString(),
    comunidadId: autor.comunidadId,
    autorId: uid,
    fechaCreacion: new Date().toISOString(),
    estado: 'pendiente',
  };

  if (paraTodos) {
    recordatorioData['paraTodaLaComunidad'] = true;
  } else {
    const destinatarioSnaps = await Promise.all(usuarioIds.map(id => db.doc(`usuarios/${id}`).get()));
    const asignadosValidos = destinatarioSnaps
      .map((snap, index) => ({ id: usuarioIds[index], data: snap.data() as UsuarioData | undefined }))
      .filter(({ data }) => data?.comunidadId === autor.comunidadId)
      .map(({ id }) => id);

    if (!asignadosValidos.length) {
      throw new HttpsError('not-found', 'Ningún vecino seleccionado pertenece a tu comunidad.');
    }

    recordatorioData['usuariosAsignados'] = asignadosValidos;
  }

  const ref = await db.collection('recordatorios').add(recordatorioData);

  logger.info('Recordatorio asignado creado', {
    recordatorioId: ref.id,
    autorId: uid,
    paraTodos,
    asignados: paraTodos ? undefined : (recordatorioData['usuariosAsignados'] as string[]).length,
  });

  return { recordatorioId: ref.id };
});
