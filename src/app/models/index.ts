// ✅ Según diagrama del proyecto
export interface Aviso {
  idAviso?: string;
  tituloAviso: string;
  descripcionAviso: string;
  tipoAviso: string;
  fechaPublicacion?: string;
  ubicacionAviso?: string;
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

export interface Recordatorio {
  idRecordatorios?: string;
  tituloRecordatorio: string;
  descripcionRecordatorio: string;
  fechaHora: string;
  idUsuario: string;
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
}

