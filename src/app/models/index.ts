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

export interface Usuario {
  idUsuario?: string;
  nombre: string;
  correo: string;
  telefono: string;
  numeroApartamento?: string;
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

