import { TestBed } from '@angular/core/testing';
import { MessagePayload } from '@angular/fire/messaging';
import { of } from 'rxjs';
import { environment } from '../../environments/environment';
import { FirestoreService } from './firestore.service';
import { FcmService } from './fcm.service';
import { LocalNotificationService } from './local-notification.service';
import { MessagingClientService } from './messaging-client.service';

describe('FcmService', () => {
  let service: FcmService;
  let registrarDispositivoSpy: jasmine.Spy;
  let getTokenSpy: jasmine.Spy;
  let vapidKeyOriginal: string;
  let listeners: Array<(payload: MessagePayload) => void>;
  const usuario = {
    idUsuario: 'usuario-1',
    nombre: 'Usuario',
    correo: 'usuario@alertbxt.test',
    telefono: '3000000000',
    rol: 'residente' as const,
    activo: true,
    comunidadId: 'comunidad-1',
  };

  beforeEach(() => {
    vapidKeyOriginal = environment.messagingVapidKey;
    environment.messagingVapidKey = 'vapid-key-de-prueba';
    registrarDispositivoSpy = jasmine.createSpy('registrarDispositivo').and.returnValue(of(void 0));
    getTokenSpy = jasmine.createSpy('getToken').and.resolveTo('token-fcm-exitoso');
    listeners = [];

    TestBed.configureTestingModule({
      providers: [
        FcmService,
        {
          provide: MessagingClientService,
          useValue: {
            getToken: getTokenSpy,
            onMessage: (listener: (payload: MessagePayload) => void) => {
              listeners.push(listener);
              return () => undefined;
            },
          },
        },
        { provide: FirestoreService, useValue: { registrarDispositivo: registrarDispositivoSpy } },
        {
          provide: LocalNotificationService,
          useValue: {
            enableNotifications: () => Promise.resolve('granted'),
            showNotification: () => undefined,
          },
        },
      ],
    });
    service = TestBed.inject(FcmService);
  });

  afterEach(() => {
    environment.messagingVapidKey = vapidKeyOriginal;
  });

  it('guarda el token FCM en la subcolección del usuario cuando getToken responde exitosamente', async () => {
    spyOn(navigator.serviceWorker, 'register').and.resolveTo({} as ServiceWorkerRegistration);

    await service.iniciarParaUsuario(usuario);

    expect(getTokenSpy).toHaveBeenCalled();
    expect(registrarDispositivoSpy).toHaveBeenCalledWith('usuario-1', jasmine.objectContaining({
      token: 'token-fcm-exitoso',
      fechaRegistro: jasmine.any(String),
    }));
  });

  it('muestra un solo aviso del mismo evento entre pestañas y conserva eventos con el mismo título', async () => {
    const activos = new Set<string>();
    const mostrar = jasmine.createSpy('showNotification').and.callFake(async (_title: string, options: NotificationOptions) => {
      activos.add(options.tag!);
    });
    const registration = {
      getNotifications: async ({ tag }: GetNotificationOptions) => activos.has(tag!) ? [{}] : [],
      showNotification: mostrar,
    } as unknown as ServiceWorkerRegistration;
    spyOn(navigator.serviceWorker, 'register').and.resolveTo(registration);
    const segundaPestana = TestBed.runInInjectionContext(() => new FcmService());
    await Promise.all([service.iniciarParaUsuario(usuario), segundaPestana.iniciarParaUsuario(usuario)]);

    const recibirEnPestanas = async (eventoId: string) => {
      const payload: MessagePayload = {
        from: 'test', collapseKey: '', messageId: 'fcm-1',
        data: { eventoId },
        notification: { title: 'Notificación', body: 'Asamblea' },
      };
      for (const listener of listeners) {
        listener(payload);
      }
      await navigator.locks.request(`alertbxt-push:${eventoId}`, () => undefined);
    };

    await recibirEnPestanas('notificacion:a:fecha');
    expect(mostrar).toHaveBeenCalledOnceWith('Notificación', jasmine.objectContaining({
      body: 'Asamblea', tag: 'notificacion:a:fecha',
    }));
    await recibirEnPestanas('notificacion:b:fecha');
    expect(mostrar).toHaveBeenCalledTimes(2);
    expect(mostrar.calls.mostRecent().args[1].tag).toBe('notificacion:b:fecha');
    expect(listeners.length).toBe(2);
  });
});
