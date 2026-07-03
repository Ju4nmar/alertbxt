// ✅ Según diagrama del proyecto
export interface Aviso {
  idAviso?: string;
  tituloAviso: string;
  descripcionAviso: string;
  tipoAviso: string;
  fechaPublicacion?: string;
  autorId: string;
  autorNombre?: string;
  comunidadId: string;
  imagen?: string;
}

export interface Usuario {
  idUsuario?: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: 'admin' | 'residente';
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

// Tipos alias para compatibilidad con código existente
export type Neighborhood = Comunidad;
export type User = Usuario;

