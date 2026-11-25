import { firstValueFrom } from 'rxjs';
import { LocalNotificationService } from './local-notification.service';

describe('LocalNotificationService', () => {
  let permiso: NotificationPermission;
  let solicitar: jasmine.Spy;
  let mostrarNativa: jasmine.Spy;

  beforeEach(() => {
    permiso = 'default';
    solicitar = jasmine.createSpy('requestPermission');
    mostrarNativa = spyOn(window, 'Notification');
    Object.defineProperties(mostrarNativa, {
      permission: { get: () => permiso },
      requestPermission: { value: solicitar },
    });
  });

  it('solicita permiso por primera vez y publica el resultado', async () => {
    solicitar.and.resolveTo('granted');
    const servicio = new LocalNotificationService();
    expect(await firstValueFrom(servicio.notificationsEnabled$)).toBeFalse();
    expect(await servicio.enableNotifications()).toBe('granted');
    expect(solicitar).toHaveBeenCalledTimes(1);
    expect(await firstValueFrom(servicio.notificationsEnabled$)).toBeTrue();
  });

  it('respeta un permiso denegado sin volver a preguntar ni mostrar notificaciones', async () => {
    permiso = 'denied';
    const servicio = new LocalNotificationService();
    expect(await servicio.enableNotifications()).toBe('denied');
    servicio.showNotification('Aviso');
    expect(await firstValueFrom(servicio.notificationsEnabled$)).toBeFalse();
    expect(solicitar).not.toHaveBeenCalled();
    expect(mostrarNativa).not.toHaveBeenCalled();
  });

  it('entrega el aviso al service worker con los iconos y opciones correspondientes', async () => {
    permiso = 'granted';
    const mostrar = jasmine.createSpy('showNotification').and.resolveTo();
    spyOnProperty(navigator.serviceWorker, 'ready').and.resolveTo({
      showNotification: mostrar,
    } as unknown as ServiceWorkerRegistration);
    const servicio = new LocalNotificationService();
    expect(await firstValueFrom(servicio.notificationsEnabled$)).toBeTrue();
    servicio.showNotification('Asamblea', { body: 'Hoy', tag: 'aviso-1', icon: 'icono.png' });
    await Promise.resolve();
    expect(mostrar).toHaveBeenCalledOnceWith('Asamblea', {
      body: 'Hoy', tag: 'aviso-1', icon: 'icono.png', badge: 'assets/icon/favicon.png',
    });
    expect(mostrarNativa).not.toHaveBeenCalled();
  });

  it('usa la notificación nativa si falla el service worker', async () => {
    permiso = 'granted';
    const mostrar = jasmine.createSpy('showNotification').and.rejectWith(new Error('worker indisponible'));
    spyOnProperty(navigator.serviceWorker, 'ready').and.resolveTo({
      showNotification: mostrar,
    } as unknown as ServiceWorkerRegistration);
    const entregada = new Promise<void>(resolve => {
      mostrarNativa.and.callFake(function () {
        resolve();
      });
    });
    new LocalNotificationService().showNotification('Alerta', { body: 'Revisa el aviso' });
    await entregada;
    expect(mostrarNativa).toHaveBeenCalledOnceWith('Alerta', {
      body: 'Revisa el aviso', icon: 'assets/icon/favicon.png', badge: 'assets/icon/favicon.png',
    });
  });
});
