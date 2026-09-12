import { TestBed } from '@angular/core/testing';
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

  beforeEach(() => {
    vapidKeyOriginal = environment.messagingVapidKey;
    environment.messagingVapidKey = 'vapid-key-de-prueba';
    registrarDispositivoSpy = jasmine.createSpy('registrarDispositivo').and.returnValue(of(void 0));
    getTokenSpy = jasmine.createSpy('getToken').and.resolveTo('token-fcm-exitoso');

    TestBed.configureTestingModule({
      providers: [
        FcmService,
        {
          provide: MessagingClientService,
          useValue: {
            getToken: getTokenSpy,
            onMessage: () => () => undefined,
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

    await service.iniciarParaUsuario({
      idUsuario: 'usuario-1',
      nombre: 'Usuario',
      correo: 'usuario@alertbxt.test',
      telefono: '3000000000',
      rol: 'residente',
      activo: true,
      comunidadId: 'comunidad-1',
    });

    expect(getTokenSpy).toHaveBeenCalled();
    expect(registrarDispositivoSpy).toHaveBeenCalledWith('usuario-1', jasmine.objectContaining({
      token: 'token-fcm-exitoso',
      fechaRegistro: jasmine.any(String),
    }));
  });
});
