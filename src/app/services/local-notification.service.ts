import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LocalNotificationService {
  private notificationsEnabledSubject = new BehaviorSubject<boolean>(this.getInitialPermissionState());
  readonly notificationsEnabled$ = this.notificationsEnabledSubject.asObservable();

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

  showNotification(title: string, options: NotificationOptions = {}): void {
    void this.notify(title, options);
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

  private getInitialPermissionState(): boolean {
    return 'Notification' in window && Notification.permission === 'granted';
  }
}
