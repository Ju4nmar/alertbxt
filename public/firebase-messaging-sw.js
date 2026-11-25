/* global firebase */
// Mantener esta configuración sincronizada con environment.firebaseConfig.
// La clave VAPID no se usa en el worker; se configura al solicitar getToken() en el cliente.
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAgcluXkKPlYonfQSBDFqZUotBcyU-tpBA',
  authDomain: 'alertbxt.firebaseapp.com',
  projectId: 'alertbxt',
  storageBucket: 'alertbxt.firebasestorage.app',
  messagingSenderId: '392991506907',
  appId: '1:392991506907:web:c892fc7459052ff444e7fe',
  measurementId: 'G-Q8KNG7S9Q2',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  // Firebase ya mostró el mensaje antes de invocar este callback.
  if (payload.notification) {
    return;
  }

  const title = payload.data?.title || 'AlertBxt';
  const options = {
    body: payload.data?.body || '',
    icon: '/assets/icon/favicon.png',
  };

  return self.registration.showNotification(title, options);
});
