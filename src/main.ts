import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { ErrorHandler, LOCALE_ID, enableProdMode, isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { getApp, provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck, provideAppCheck } from '@angular/fire/app-check';
import { connectFirestoreEmulator, initializeFirestore, provideFirestore, getFirestore } from '@angular/fire/firestore';
// Las fábricas de caché se importan del SDK directo (igual que en auth): las
// versiones envueltas por @angular/fire no están pensadas para esto.
import { persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
// setPersistence y browserLocalPersistence se importan del SDK directo: la
// versión envuelta por @angular/fire convierte la clase en una función que ya
// no se puede instanciar ("t is not a constructor").
import { browserLocalPersistence, setPersistence } from 'firebase/auth';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';
import { provideFunctions, getFunctions } from '@angular/fire/functions';
import { provideServiceWorker } from '@angular/service-worker';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { GlobalErrorHandler } from './app/global-error-handler';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

// Fechas y horas en español de Colombia (el pipe date usa este idioma).
registerLocaleData(localeEsCo);

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    provideIonicAngular(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    // App Check queda inactivo hasta que se configure un site key real (ver
    // environment.ts): sin él, provideAppCheck ni se registra, así que el
    // resto de la app funciona exactamente igual que antes. No se activa
    // tampoco contra los emuladores (environment.e2e.ts), que no lo validan.
    ...(environment.appCheckSiteKey && !environment.useEmulators
      ? [provideAppCheck(() => {
          if (!environment.production) {
            // Token de depuración para `ng serve`: Firebase lo imprime en
            // consola la primera vez: hay que registrarlo una única vez en
            // Firebase Console > App Check > la app > tokens de depuración.
            (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          }
          return initializeAppCheck(getApp(), {
            provider: new ReCaptchaEnterpriseProvider(environment.appCheckSiteKey),
            isTokenAutoRefreshEnabled: true,
          });
        })]
      : []),
    provideFirestore(() => {
      if (environment.useEmulators) {
        const firestore = getFirestore(getApp());
        connectFirestoreEmulator(firestore, 'localhost', 8080);
        return firestore;
      }
      // Persistencia offline: los datos ya vistos se leen de IndexedDB sin red
      // y las escrituras (p. ej. una alerta SOS) quedan en cola y se envían
      // solas al reconectar, también entre pestañas. Si el navegador no la
      // permite (modo privado, almacenamiento bloqueado) o ya hay una
      // instancia (recarga en caliente), se usa la instancia normal.
      try {
        return initializeFirestore(getApp(), {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
      } catch (error) {
        console.warn('Persistencia offline no disponible:', error);
        return getFirestore(getApp());
      }
    }),
    provideMessaging(() => getMessaging(getApp())),
    provideFunctions(() => getFunctions(getApp())),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      } else {
        setPersistence(auth, browserLocalPersistence).catch(error => {
          console.warn('No se pudo fijar la persistencia de sesión:', error);
        });
      }
      return auth;
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately',
    }),
  ]
}).catch(err => console.error(err));

