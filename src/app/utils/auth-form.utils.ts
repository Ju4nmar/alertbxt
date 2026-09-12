/**
 * Validaciones y utilidades compartidas por los formularios de autenticación
 * (login, registro, unirse a vecindad, recuperar contraseña, perfil).
 * Centralizadas aquí porque antes estaban duplicadas de forma idéntica en
 * cada página.
 */

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^[0-9+ ]{7,15}$/.test(phone);
}

/** Extrae el código de error (p. ej. "auth/wrong-password") de un error de Firebase. */
export function getFirebaseErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
}
