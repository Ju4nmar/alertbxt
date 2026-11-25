const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const funcion = readFileSync(resolve(__dirname, '../functions/lib/index.js'), 'utf8');

test('la tarea usa un identificador estable y envía a cada token distinto una sola vez', async () => {
  const fechaHora = '2099-06-12T09:30:00.000Z';
  const envios = [];
  const consultas = [];
  const eliminados = [];
  const estados = [];
  const dispositivos = {
    'usuarios/u1/dispositivos': ['celular', 'pc'],
    'usuarios/u2/dispositivos': ['celular'],
  };
  const db = {
    doc: path => path.startsWith('notificaciones/') ? {
      get: async () => ({
        exists: true,
        data: () => ({ fechaHora, tituloNotificacion: 'Asamblea', usuariosAsignados: ['u1', 'u1', 'u2'] }),
      }),
      update: async cambios => { estados.push(cambios.estado); },
    } : { delete: async () => { eliminados.push(path); } },
    collection: path => ({
      get: async () => {
        consultas.push(path);
        return { docs: dispositivos[path].map(id => ({ id })) };
      },
    }),
  };
  const registrar = (_opciones, handler) => handler;
  const modulos = {
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/firestore': { getFirestore: () => db },
    'firebase-admin/functions': {},
    'firebase-admin/messaging': {
      getMessaging: () => ({
        sendEachForMulticast: async payload => {
          envios.push(payload);
          return {
            responses: payload.tokens.map(token => token === 'celular' ? {
              success: false, error: { code: 'messaging/registration-token-not-registered' },
            } : { success: true }),
          };
        },
      }),
    },
    'firebase-functions/v2/firestore': {
      onDocumentWritten: registrar, onDocumentCreated: registrar, onDocumentDeleted: registrar,
    },
    'firebase-functions/v2/tasks': { onTaskDispatched: registrar },
    'firebase-functions/v2/https': { onCall: handler => handler },
    'firebase-functions/v2': {},
    './recuperacion': {},
  };
  const exports = {};
  runInNewContext(funcion, { exports, require: id => modulos[id] });

  await exports.enviarNotificacionPush({ data: { idNotificacion: 'n1', fechaHoraEsperada: 'fecha anterior' } });
  assert.equal(envios.length, 0);
  await exports.enviarNotificacionPush({ data: { idNotificacion: 'n1', fechaHoraEsperada: fechaHora } });
  assert.equal(envios.length, 1);
  assert.deepEqual([...envios[0].tokens].sort(), ['celular', 'pc']);
  assert.deepEqual(consultas.sort(), ['usuarios/u1/dispositivos', 'usuarios/u2/dispositivos']);
  assert.equal(envios[0].data.eventoId, `notificacion:n1:${fechaHora}`);
  assert.equal(envios[0].webpush.notification.tag, envios[0].data.eventoId);
  assert.deepEqual(eliminados.sort(), ['usuarios/u1/dispositivos/celular', 'usuarios/u2/dispositivos/celular']);
  assert.deepEqual(estados, ['completado']);
});
