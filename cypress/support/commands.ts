// Comandos personalizados para sembrar y limpiar datos en los emuladores
// locales de Firebase (Auth + Firestore), usados por las pruebas E2E.
// Nunca tocan el proyecto real de Firebase: los emuladores solo aceptan
// conexiones locales y se descartan al reiniciarlos.

export interface UsuarioSembrado {
  nombre: string;
  correo: string;
  password: string;
  telefono?: string;
  rol?: 'admin' | 'residente';
  activo?: boolean;
  comunidadId?: string;
  numeroApartamento?: string;
}

// Cypress.env() (acceso directo desde el objeto global Cypress) se eliminó
// en Cypress 16; hay que leer las variables de entorno con cy.env() dentro
// del contexto de ejecución de un comando/prueba.
function proyecto(): string {
  return cy.env('firebaseProjectId');
}

function apiKey(): string {
  return cy.env('firebaseApiKey');
}

function authUrl(): string {
  return cy.env('authEmulatorUrl');
}

function firestoreUrl(): string {
  return cy.env('firestoreEmulatorUrl');
}

// Convierte un objeto plano a formato de documento REST de Firestore
// (https://firebase.google.com/docs/firestore/reference/rest/v1/Value).
function aFirestoreFields(datos: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor === undefined) continue;
    if (typeof valor === 'boolean') {
      fields[clave] = { booleanValue: valor };
    } else if (typeof valor === 'string') {
      fields[clave] = { stringValue: valor };
    } else {
      fields[clave] = { stringValue: String(valor) };
    }
  }
  return fields;
}

Cypress.Commands.add('limpiarEmuladores', () => {
  cy.request('DELETE', `${firestoreUrl()}/emulator/v1/projects/${proyecto()}/databases/(default)/documents`);
  cy.request({
    method: 'DELETE',
    url: `${authUrl()}/emulator/v1/projects/${proyecto()}/accounts`,
    failOnStatusCode: false,
  });
});

Cypress.Commands.add('seedUsuario', (datos: UsuarioSembrado) => {
  return cy.request('POST', `${authUrl()}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey()}`, {
    email: datos.correo,
    password: datos.password,
    returnSecureToken: true,
  }).then(respuesta => {
    const uid = respuesta.body.localId as string;

    const usuario = {
      idUsuario: uid,
      nombre: datos.nombre,
      correo: datos.correo,
      telefono: datos.telefono ?? '3000000000',
      rol: datos.rol ?? 'residente',
      activo: datos.activo ?? true,
      comunidadId: datos.comunidadId ?? 'comunidad-e2e',
      fechaRegistro: new Date().toISOString(),
      ...(datos.numeroApartamento ? { numeroApartamento: datos.numeroApartamento } : {}),
    };

    return cy.request(
      'PATCH',
      `${firestoreUrl()}/v1/projects/${proyecto()}/databases/(default)/documents/usuarios/${uid}`,
      { fields: aFirestoreFields(usuario) }
    ).then(() => uid);
  });
});

Cypress.Commands.add('seedComunidad', (idComunidad: string, datos: Record<string, string>) => {
  return cy.request(
    'PATCH',
    `${firestoreUrl()}/v1/projects/${proyecto()}/databases/(default)/documents/comunidades/${idComunidad}`,
    { fields: aFirestoreFields(datos) }
  );
});
