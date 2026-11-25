import { Injectable, inject } from '@angular/core';
import { MessagePayload } from '@angular/fire/messaging';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Usuario } from '../models';
import { FirestoreService } from './firestore.service';
import { LocalNotificationService } from './local-notification.service';
import { MessagingClientService } from './messaging-client.service';

@Injectable({ providedIn: 'root' })
export class FcmService {
  private readonly messagingClient = inject(MessagingClientService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly localNotificationService = inject(LocalNotificationService);
  private currentUserId = '';
  private stopForegroundListener?: () => void;

  async iniciarParaUsuario(usuario: Usuario): Promise<void> {
    if (!usuario.idUsuario) {
      return;
    }

    if (!this.esCompatible()) {
      console.warn('Firebase Cloud Messaging no es compatible con este navegador o contexto.');
      return;
    }

    if (!environment.messagingVapidKey) {
      console.warn('FCM no se inicializó: configura environment.messagingVapidKey con la clave pública VAPID.');
      return;
    }

    // Comparte el permiso con el servicio local para mantener activas sus notificaciones del feed.
    const permiso = await this.localNotificationService.enableNotifications();
    if (permiso !== 'granted') {
      console.warn('FCM no se inicializó: el permiso de notificaciones no fue concedido.');
      return;
    }

    try {
      const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        // El ámbito aislado evita reemplazar ngsw-worker.js, que mantiene el PWA actual.
        scope: '/firebase-cloud-messaging/',
      });
      const token = await this.messagingClient.getToken({
        vapidKey: environment.messagingVapidKey,
        serviceWorkerRegistration,
      });

      if (!token) {
        return;
      }

      await firstValueFrom(this.firestoreService.registrarDispositivo(usuario.idUsuario, {
        token,
        fechaRegistro: new Date().toISOString(),
      }));
      this.configurarMensajesEnPrimerPlano(usuario.idUsuario, serviceWorkerRegistration);
    } catch (error) {
      console.error('No se pudo inicializar Firebase Cloud Messaging:', error);
    }
  }

  detener(): void {
    this.stopForegroundListener?.();
    this.stopForegroundListener = undefined;
    this.currentUserId = '';
  }

  private configurarMensajesEnPrimerPlano(idUsuario: string, registration: ServiceWorkerRegistration): void {
    if (this.currentUserId === idUsuario && this.stopForegroundListener) {
      return;
    }

    this.detener();
    this.currentUserId = idUsuario;
    this.stopForegroundListener = this.messagingClient.onMessage(payload => {
      void this.mostrarMensajeEnPrimerPlano(payload, registration).catch(error =>
        console.error('No se pudo mostrar la notificación push:', error)
      );
    });
  }

  private async mostrarMensajeEnPrimerPlano(payload: MessagePayload, registration: ServiceWorkerRegistration): Promise<void> {
    const title = payload.notification?.title || payload.data?.['title'] || 'AlertBxt';
    const body = payload.notification?.body || payload.data?.['body'] || '';
    const eventoId = payload.data?.['eventoId']
      || (payload.data?.['notificacionId'] ? payload.messageId : undefined);
    if (eventoId) {
      // Las pestañas comparten el registro de FCM y el bloqueo de este origen.
      const mostrarUnaVez = async () => {
        if (!(await registration.getNotifications({ tag: eventoId })).length) {
          await registration.showNotification(title, {
            body, tag: eventoId, icon: '/assets/icon/favicon.png', badge: '/assets/icon/favicon.png',
          });
        }
      };
      if (navigator.locks) {
        await navigator.locks.request(`alertbxt-push:${eventoId}`, mostrarUnaVez);
      } else {
        // La etiqueta reemplaza un aviso activo incluso sin Web Locks.
        await mostrarUnaVez();
      }
      return;
    }

    this.localNotificationService.showNotification(title, {
      body,
      tag: payload.messageId || `fcm-${Date.now()}`,
    });
  }

  private esCompatible(): boolean {
    return typeof window !== 'undefined'
      && 'Notification' in window
      && 'serviceWorker' in navigator;
  }
}
