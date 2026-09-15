import { UsuarioSembrado } from './commands';

declare global {
  namespace Cypress {
    interface Chainable {
      /** Crea un usuario en el emulador de Auth y su perfil en el de Firestore; devuelve el uid. */
      seedUsuario(datos: UsuarioSembrado): Chainable<string>;
      /** Crea/actualiza un documento de comunidad en el emulador de Firestore. */
      seedComunidad(idComunidad: string, datos: Record<string, string>): Chainable<unknown>;
      /** Borra todos los usuarios y documentos de los emuladores locales. */
      limpiarEmuladores(): Chainable<unknown>;
    }
  }
}
