// 'residente' es el valor histórico de 'propietario' (ver el tipo Rol en
// models): comparten etiqueta mientras corre la migración de datos.
export function etiquetaRol(rol: string | undefined): string {
  switch (rol) {
    case 'admin':
      return 'Administrador';
    case 'arrendatario':
      return 'Arrendatario';
    case 'guarda':
      return 'Guarda';
    case 'propietario':
    case 'residente':
      return 'Propietario';
    default:
      return '';
  }
}
