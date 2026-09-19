import { UsuarioSembrado } from './commands';

declare global {
  namespace Cypress {
    interface Chainable {
      /** Crea un usuario en el emulador de Auth y su perfil en el de Firestore; devuelve el uid. */
      seedUsuario(datos: UsuarioSembrado): Chainable<string>;
      /** Crea/actualiza un documento de comunidad en el emulador de Firestore. */
      seedComunidad(idComunidad: string, datos: Record<string, string>): Chainable<unknown>;
      /** Crea el documento de codigos_invitacion/{codigo} para una comunidad ya sembrada. */
      registrarCodigoInvitacion(codigo: string, comunidadId: string, nombreComunidad: string): Chainable<unknown>;
      /** Borra todos los usuarios y documentos de los emuladores locales. */
      limpiarEmuladores(): Chainable<unknown>;
      /** Hace un primer alta y escritura contra los emuladores en frío y los limpia. */
      calentarEmuladores(): Chainable<unknown>;
    }
  }
}
