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

// Cypress 16 cambió la firma de cy.env()/Cypress.env() para leer un solo
// valor (ver https://on.cypress.io/cypress-env-migration) y ese mecanismo
// quedó inestable entre versiones. Como estos valores nunca cambian (son
// los emuladores locales de firebase.json y environment.e2e.ts, no
// secretos), se dejan como constantes fijas en vez de pasarlos por env.
function proyecto(): string {
  return 'alertbxt';
}

function apiKey(): string {
  return 'demo-api-key';
}

function authUrl(): string {
  return 'http://localhost:9099';
}

function firestoreUrl(): string {
  return 'http://localhost:8080';
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

    return cy.request({
      method: 'PATCH',
      url: `${firestoreUrl()}/v1/projects/${proyecto()}/databases/(default)/documents/usuarios/${uid}`,
      // El token "owner" es un valor especial que solo reconoce el emulador
      // local: salta las reglas de seguridad para poder sembrar datos de
      // prueba directamente. Nunca funciona contra el Firestore real.
      headers: { Authorization: 'Bearer owner' },
      body: { fields: aFirestoreFields(usuario) },
    }).then(() => uid);
  });
});

Cypress.Commands.add('seedComunidad', (idComunidad: string, datos: Record<string, string>) => {
  return cy.request({
    method: 'PATCH',
    url: `${firestoreUrl()}/v1/projects/${proyecto()}/databases/(default)/documents/comunidades/${idComunidad}`,
    headers: { Authorization: 'Bearer owner' },
    body: { fields: aFirestoreFields(datos) },
  });
});

// Crea el documento de codigos_invitacion/{codigo} que
// getComunidadByCodigoInvitacion() lee para validar un código sin que el
// que se une esté autenticado (ver FirestoreService).
Cypress.Commands.add('registrarCodigoInvitacion', (codigo: string, comunidadId: string, nombreComunidad: string) => {
  return cy.request({
    method: 'PATCH',
    url: `${firestoreUrl()}/v1/projects/${proyecto()}/databases/(default)/documents/codigos_invitacion/${codigo}`,
    headers: { Authorization: 'Bearer owner' },
    body: { fields: aFirestoreFields({ comunidadId, nombreComunidad }) },
  });
});
