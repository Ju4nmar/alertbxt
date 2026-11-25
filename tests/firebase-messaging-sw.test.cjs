const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const worker = readFileSync(resolve(__dirname, '../public/firebase-messaging-sw.js'), 'utf8');

function iniciarWorker() {
  const visibles = [];
  let callback;
  const registration = {
    async showNotification(title, options) {
      visibles.push({ title, body: options.body });
    },
  };
  runInNewContext(worker, {
    self: { registration },
    importScripts() {},
    firebase: {
      initializeApp() {},
      messaging: () => ({ onBackgroundMessage: handler => { callback = handler; } }),
    },
  });

  return {
    visibles,
    async recibirEnSegundoPlano(payload) {
      // Contrato del SDK: auto-muestra notification antes de invocar al handler.
      if (payload.notification) {
        await registration.showNotification(payload.notification.title, payload.notification);
      }
      await callback(payload);
    },
  };
}

test('un push con notification se muestra una sola vez en segundo plano', async () => {
  const { recibirEnSegundoPlano, visibles } = iniciarWorker();
  await recibirEnSegundoPlano({ notification: { title: 'Notificación', body: 'Asamblea' } });
  assert.deepEqual(visibles, [{ title: 'Notificación', body: 'Asamblea' }]);
});

test('un push solo con datos sigue mostrando un aviso en segundo plano', async () => {
  const { recibirEnSegundoPlano, visibles } = iniciarWorker();
  await recibirEnSegundoPlano({ data: { title: 'Notificación', body: 'Asamblea' } });
  assert.deepEqual(visibles, [{ title: 'Notificación', body: 'Asamblea' }]);
});
