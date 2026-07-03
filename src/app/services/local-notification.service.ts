import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subscription, catchError, combineLatest, of } from 'rxjs';
import { Aviso, Recordatorio, Usuario } from '../models';
import { FirestoreService } from './firestore.service';

@Injectable({
  providedIn: 'root',
})
export class LocalNotificationService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly reminderTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly knownAvisos = new Set<string>();
  private readonly notifiedReminders = new Set<string>(this.readNotifiedReminders());
  private subscription?: Subscription;
  private activeUserKey = '';
  private avisosReady = false;
  private notificationsEnabledSubject = new BehaviorSubject<boolean>(this.getInitialPermissionState());
  readonly notificationsEnabled$ = this.notificationsEnabledSubject.asObservable();

  async start(user: Usuario): Promise<void> {
    const userKey = `${user.idUsuario || ''}:${user.comunidadId || ''}`;
    if (!user.idUsuario || !user.comunidadId || this.activeUserKey === userKey) {
      return;
    }

    this.stop();
    this.activeUserKey = userKey;
    this.subscription = combineLatest([
      this.firestoreService.getAvisosByComunidad(user.comunidadId).pipe(
        catchError(error => {
          console.error('Error leyendo avisos para notificaciones:', error);
          return of([]);
        })
      ),
      this.firestoreService.getRecordatoriosByUsuario(user.idUsuario).pipe(
        catchError(error => {
          console.error('Error leyendo recordatorios para notificaciones:', error);
          return of([]);
        })
      ),
    ]).subscribe({
      next: ([avisos, recordatorios]) => {
        this.processAvisos(avisos);
        this.scheduleRecordatorios(recordatorios);
      },
      error: error => console.error('Error preparando notificaciones:', error),
    });
  }

  async enableNotifications(): Promise<NotificationPermission | 'unsupported'> {
    if (!('Notification' in window)) {
      return 'unsupported';
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      this.notificationsEnabledSubject.next(permission === 'granted');
      return permission;
    }

    this.notificationsEnabledSubject.next(Notification.permission === 'granted');
    return Notification.permission;
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.activeUserKey = '';
    this.avisosReady = false;
    this.knownAvisos.clear();
    this.reminderTimers.forEach(timer => clearTimeout(timer));
    this.reminderTimers.clear();
  }

  private processAvisos(avisos: Aviso[]): void {
    const currentIds = avisos.map(aviso => aviso.idAviso).filter(Boolean) as string[];

    if (!this.avisosReady) {
      currentIds.forEach(id => this.knownAvisos.add(id));
      this.avisosReady = true;
      return;
    }

    avisos.forEach(aviso => {
      const id = aviso.idAviso;
      if (!id || this.knownAvisos.has(id)) {
        return;
      }

      this.knownAvisos.add(id);
      this.notify(
        aviso.tipoAviso === 'alerta' || aviso.tipoAviso === 'emergencia' ? 'Nueva alerta publicada' : 'Nuevo evento publicado',
        {
          body: aviso.tituloAviso,
          tag: `aviso-${id}`,
        }
      );
    });
  }

  private scheduleRecordatorios(recordatorios: Recordatorio[]): void {
    const activeIds = new Set(recordatorios.map(recordatorio => recordatorio.idRecordatorios).filter(Boolean) as string[]);

    this.reminderTimers.forEach((timer, id) => {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        this.reminderTimers.delete(id);
      }
    });

    recordatorios.forEach(recordatorio => {
      const id = recordatorio.idRecordatorios;
      if (!id || this.reminderTimers.has(id) || this.notifiedReminders.has(id)) {
        return;
      }

      const reminderTime = new Date(recordatorio.fechaHora).getTime();
      const delay = reminderTime - Date.now();
      const maxDelay = 24 * 24 * 60 * 60 * 1000;

      if (Number.isNaN(reminderTime) || delay < 0 || delay > maxDelay) {
        return;
      }

      const timer = setTimeout(() => {
        this.notify('Recordatorio', {
          body: recordatorio.tituloRecordatorio,
          tag: `recordatorio-${id}`,
        });
        this.markReminderAsNotified(id);
        // Marcar como completado en Firestore
        this.firestoreService.updateRecordatorio(id, { estado: 'completado' as const })
          .subscribe({
            error: error => console.error('Error al marcar recordatorio como completado:', error),
          });
        this.reminderTimers.delete(id);
      }, delay);

      this.reminderTimers.set(id, timer);
    });
  }

  private async notify(title: string, options: NotificationOptions): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const notificationOptions: NotificationOptions = {
      icon: 'assets/icon/favicon.png',
      badge: 'assets/icon/favicon.png',
      ...options,
    };

    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration) {
        await registration.showNotification(title, notificationOptions);
        return;
      }
    } catch {
      // El fallback con Notification cubre navegadores sin service worker listo.
    }

    new Notification(title, notificationOptions);
  }

  showNotification(title: string, options: NotificationOptions = {}): void {
    void this.notify(title, options);
  }

  private getInitialPermissionState(): boolean {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  private markReminderAsNotified(id: string): void {
    this.notifiedReminders.add(id);
    localStorage.setItem('alertbxt:notified-reminders', JSON.stringify([...this.notifiedReminders]));
  }

  private readNotifiedReminders(): string[] {
    try {
      const value = localStorage.getItem('alertbxt:notified-reminders');
      return value ? JSON.parse(value) as string[] : [];
    } catch {
      return [];
    }
  }
}
