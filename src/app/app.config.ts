import { ApplicationConfig, isDevMode } from '@angular/core';
import { browserLocalPersistence, getAuth, setPersistence, provideAuth } from '@angular/fire/auth';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideIonicAngular(),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideFirestore(() => getFirestore(getApp())),
    provideAuth(() => {
      const auth = getAuth();
      void setPersistence(auth, browserLocalPersistence);
      return auth;
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately',
    }),
  ],
};
