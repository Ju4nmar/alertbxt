export const environment = {
  production: true,
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
  // Site key "score-based" de reCAPTCHA Enterprise (Google Cloud Console >
  // Security > reCAPTCHA Enterprise > crear clave) registrada luego en
  // Firebase Console > Build > App Check > Apps. Mientras quede vacío,
  // main.ts no activa App Check (ver comentario ahí).
  appCheckSiteKey: ''
};
