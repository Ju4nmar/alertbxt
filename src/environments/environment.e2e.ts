// Usado por la configuración "e2e" de angular.json (fileReplacements) para
// que `ng serve --configuration=e2e` conecte Auth y Firestore a los
// emuladores locales de Firebase en vez del proyecto real. Así las pruebas
// Cypress corren contra datos descartables, sin tocar producción.
export const environment = {
  production: false,
  useEmulators: true,
  firebaseConfig: {
    apiKey: 'demo-api-key',
    authDomain: 'alertbxt.firebaseapp.com',
    projectId: 'alertbxt',
    storageBucket: 'alertbxt.firebasestorage.app',
    messagingSenderId: '392991506907',
    appId: '1:392991506907:web:c892fc7459052ff444e7fe',
  },
  messagingVapidKey: '',
  appCheckSiteKey: '',
};
