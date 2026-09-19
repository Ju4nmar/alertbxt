// ✅ Según diagrama del proyecto
export interface Aviso {
  idAviso?: string;
  tituloAviso: string;
  descripcionAviso: string;
  tipoAviso: string;
  fechaPublicacion?: string;
  ubicacionAviso?: string;
  // Solo alertas SOS: coordenadas GPS del momento del envío (si el usuario
  // dio permiso) y su precisión en metros.
  latitud?: number;
  longitud?: number;
  precisionMetros?: number;
  autorId: string;
  autorNombre?: string;
  comunidadId: string;
  imagen?: string;
  estado?: 'pendiente' | 'validado' | 'rechazado';
}

export type TipoComunidad = 'apartamentos' | 'casas';

export interface Usuario {
  idUsuario?: string;
  nombre: string;
  correo: string;
  telefono: string;
  // Con tipoComunidad "apartamentos" guarda el número de apartamento y
  // torre va aparte; con "casas" guarda el número de casa y torre no
  // aplica. Comunidades creadas antes de este campo no tienen
  // tipoComunidad (se tratan como "apartamentos" por compatibilidad).
  numeroApartamento?: string;
  torre?: string;
  rol: 'admin' | 'residente';
  activo: boolean;
  pendienteEliminacion?: boolean;
  fechaSolicitudEliminacion?: string;
  comunidadId: string;
  fechaRegistro?: string;
  fotoPerfil?: string;
}

export interface Comunidad {
  idComunidad?: string;
  nombreComunidad: string;
  administradorNombre: string;
  administradorCorreo: string;
  administradorCelular: string;
  codigoInvitacion: string;
  // Opcional para comunidades creadas antes de este campo; se tratan
  // como "apartamentos" donde haga falta un valor por defecto.
  tipoComunidad?: TipoComunidad;
  fechaCreacion?: string;
  ubicacion?: string;
  logoUrl?: string;
}

// idUsuario: recordatorio personal (el propio residente lo creó para sí
// mismo). usuariosAsignados / paraTodaLaComunidad: recordatorio de grupo que
// un administrador asignó a varios vecinos o a toda la comunidad — un solo
// documento compartido, no una copia por destinatario. Igual que con los
// personales, "estado" pasa a 'completado' automáticamente cuando se envía
// el push (ver functions/src/index.ts), no es algo que cada usuario marque
// por separado.
export interface Recordatorio {
  idRecordatorios?: string;
  tituloRecordatorio: string;
  descripcionRecordatorio: string;
  fechaHora: string;
  idUsuario?: string;
  usuariosAsignados?: string[];
  paraTodaLaComunidad?: boolean;
  autorId?: string;
  comunidadId: string;
  fechaCreacion?: string;
  estado?: 'pendiente' | 'completado';
}

export interface Dispositivo {
  token: string;
  fechaRegistro: string;
}

// Vive en usuarios/{destinatarioId}/mensajes_admin — solo la Cloud Function
// enviarMensajeIndividual puede escribir aquí (ver firestore.rules), así
// que siempre coincide con un push real enviado por un administrador.
export interface MensajeAdmin {
  idMensaje?: string;
  autorId: string;
  autorNombre: string;
  mensaje: string;
  fecha: string;
  // Respuesta de un residente a un mensaje del admin (ver responderMensajeAdmin).
  esRespuesta?: boolean;
  enRespuestaA?: string;
}

// Vive en usuarios/{autorId}/mensajes_enviados — copia del admin de un
// mensaje que envió (a uno o varios destinatarios a la vez). mensajeId es el
// id del documento correspondiente en usuarios/{destinatario}/mensajes_admin
// (distinto por destinatario): permite abrir el hilo de respuestas de cada
// quien desde la vista "Enviados" sin tener que buscarlo aparte.
export interface MensajeEnviado {
  idMensaje?: string;
  destinatarios: { id: string; nombre: string; mensajeId?: string }[];
  mensaje: string;
  fecha: string;
}

// Vive en usuarios/{destinatarioId}/mensajes_admin/{mensajeId}/respuestas —
// solo la Cloud Function responderMensajeAdmin puede escribir aquí.
export interface RespuestaMensaje {
  idRespuesta?: string;
  autorId: string;
  autorNombre: string;
  texto: string;
  fecha: string;
  esAdmin: boolean;
}

