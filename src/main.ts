import { ErrorHandler, enableProdMode, isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { getApp, provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck, provideAppCheck } from '@angular/fire/app-check';
import { connectFirestoreEmulator, provideFirestore, getFirestore } from '@angular/fire/firestore';
import { browserLocalPersistence, connectAuthEmulator, getAuth, provideAuth, setPersistence } from '@angular/fire/auth';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';
import { provideServiceWorker } from '@angular/service-worker';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { GlobalErrorHandler } from './app/global-error-handler';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
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
      const firestore = getFirestore(getApp());
      if (environment.useEmulators) {
        connectFirestoreEmulator(firestore, 'localhost', 8080);
      }
      return firestore;
    }),
    provideMessaging(() => getMessaging(getApp())),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      } else {
        void setPersistence(auth, browserLocalPersistence);
      }
      return auth;
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately',
    }),
  ]
}).catch(err => console.error(err));

