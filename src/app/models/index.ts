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
  // Cuando es true, solo lo ven/reciben notificación los propietarios,
  // guardas y el administrador — no los arrendatarios (p. ej. convocatorias
  // de asamblea, que son asunto del propietario).
  soloPropietarios?: boolean;
}

export type TipoComunidad = 'apartamentos' | 'casas';

// 'residente' se conserva como valor histórico: usuarios creados antes de
// esta migración pueden tenerlo momentáneamente mientras corre el script de
// migración (ver scripts/migrar-roles.js). El código nuevo nunca debe
// escribir 'residente'; usa 'propietario' en su lugar.
export type Rol = 'admin' | 'propietario' | 'arrendatario' | 'guarda' | 'residente';

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
  rol: Rol;
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
  // Restriccion de pico y placa por dia (clave en minusculas, p. ej. lunes).
  // La digita el administrador: cambia por ciudad y periodo, no se fija en codigo.
  picoPlaca?: Record<string, string>;
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
  // Igual que en Aviso: oculta el recordatorio a los arrendatarios cuando
  // es información reservada al propietario.
  soloPropietarios?: boolean;
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

// Encuesta de la comunidad. Los votos viven en encuestas/{id}/votos/{uid};
// "conteo" (índice de opción -> votos) y "totalVotos" los mantiene la Cloud
// Function onVotoCreado, no el cliente. "cierre" es ISO en el modelo y
// Timestamp en Firestore (ver normalizeEncuesta).
export interface Encuesta {
  idEncuesta?: string;
  titulo: string;
  descripcion?: string;
  opciones: string[];
  comunidadId: string;
  autorId: string;
  autorNombre?: string;
  soloPropietarios: boolean;
  cierre: string;
  fechaCreacion?: string;
  conteo: Record<string, number>;
  totalVotos: number;
}

export type TipoVehiculo = 'carro' | 'moto' | 'otro';

// Vehículo registrado por un vecino. El id del documento es
// "{comunidadId}_{placa}": así no puede haber la misma placa dos veces en una
// comunidad. Torre/apartamento y nombre se copian al registrar para que el
// guarda y el administrador identifiquen al dueño sin leer otros perfiles.
export interface Vehiculo {
  idVehiculo?: string;
  placa: string;
  tipo: TipoVehiculo;
  marca?: string;
  color?: string;
  propietarioId: string;
  propietarioNombre: string;
  torre?: string;
  apartamento?: string;
  comunidadId: string;
  fechaRegistro: string;
}
