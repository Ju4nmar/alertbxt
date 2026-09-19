// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  // Cuando es true, main.ts conecta Auth y Firestore a los emuladores
  // locales de Firebase en vez del proyecto real (ver environment.e2e.ts,
  // usado por la configuración "e2e" de angular.json para las pruebas
  // Cypress).
  useEmulators: false,
  firebaseConfig : {
  apiKey: "AIzaSyAgcluXkKPlYonfQSBDFqZUotBcyU-tpBA",
  authDomain: "alertbxt.firebaseapp.com",
  projectId: "alertbxt",
  storageBucket: "alertbxt.firebasestorage.app",
  messagingSenderId: "392991506907",
  appId: "1:392991506907:web:c892fc7459052ff444e7fe",
  measurementId: "G-Q8KNG7S9Q2"
},
  // Pega aquí la clave pública VAPID de Firebase Cloud Messaging.
  messagingVapidKey: 'BPFwLAG0d8tqH6UxM0hDSOprCfb3WZMGpAJRFSXwj1bgp8vaUfiobgH_B6gXw8VLkOKpW5UaNFDMmH0kOB0FywE',
  // Site key "score-based" de reCAPTCHA Enterprise (clave web, registrada
  // en Firebase Console > Build > App Check > Apps). En `ng serve`, main.ts
  // además genera un token de depuración: regístralo una vez en Firebase
  // Console > App Check > la app > tokens de depuración para que Firestore
  // acepte las peticiones locales cuando se active "enforce".
  appCheckSiteKey: '6Le-vb0tAAAAADOp7of4o0YkRYjykWcQRDsExXp7'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
