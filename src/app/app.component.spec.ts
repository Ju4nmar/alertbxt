import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AlertController, MenuController } from '@ionic/angular/standalone';
import type { AlertButton, AlertOptions } from '@ionic/core';
import { NEVER, of, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { Usuario } from './models';
import { AuthService } from './services/auth.service';
import { ConexionService } from './services/conexion.service';
import { FirestoreService } from './services/firestore.service';
import { FcmService } from './services/fcm.service';
import { LocalNotificationService } from './services/local-notification.service';
import { PwaInstallService } from './services/pwa-install.service';

describe('AppComponent', () => {
  const usuario: Usuario = {
    idUsuario: 'residente-1', nombre: 'Residente', correo: 'residente@alertbxt.test',
    telefono: '3000000000', rol: 'residente', activo: true, comunidadId: 'comunidad-1',
    torre: '2', numeroApartamento: '301',
  };
  let crearAlerta: jasmine.Spy<(options: AlertOptions) => Promise<{ present: jasmine.Spy }>>;
  let agregarAviso: jasmine.Spy;
  let cerrarMenu: jasmine.Spy;

  beforeEach(() => TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter([]),
      { provide: ConexionService, useValue: { get enLinea() { return true; }, enLinea$: of(true) } },
      { provide: AlertController, useValue: {
        create: crearAlerta = jasmine.createSpy('create').and.resolveTo({ present: jasmine.createSpy('present').and.resolveTo() }),
      } },
      { provide: MenuController, useValue: { close: cerrarMenu = jasmine.createSpy('close').and.resolveTo(true) } },
      {
        provide: AuthService,
        useValue: {
          currentUser$: of(null),
          getCurrentUser: () => null,
          logout: () => of(void 0),
        },
      },
      {
        provide: FirestoreService,
        useValue: {
          addAviso: agregarAviso = jasmine.createSpy('addAviso').and.returnValue(of('aviso-1')),
          getComunidadById: () => of({ tipoComunidad: 'apartamentos' }),
          limpiarCacheLocal: () => Promise.resolve(false),
        },
      },
      {
        provide: LocalNotificationService,
        useValue: {
          notificationsEnabled$: of(false),
          start: () => undefined,
          stop: () => undefined,
          enableNotifications: () => Promise.resolve('unsupported'),
        },
      },
      { provide: FcmService, useValue: { iniciarParaUsuario: () => Promise.resolve(), detener: () => undefined } },
      {
        provide: PwaInstallService,
        useValue: {
          canInstall$: of(false),
          isIosSafari: () => false,
          install: () => Promise.resolve('unavailable'),
        },
      },
    ]
  }));

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  afterEach(() => jasmine.clock().uninstall());

  function abrirSos(app: AppComponent): AlertButton {
    spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((_success, error) => {
      error?.({ code: 1, message: 'Permiso denegado' } as GeolocationPositionError);
    });
    app.currentUser = usuario;
    spyOn(TestBed.inject(AuthService), 'getCurrentUser').and.returnValue(usuario);
    app.iniciarSostenidoSos();
    jasmine.clock().tick(1400);
    expect(crearAlerta.calls.mostRecent().args[0].header).toBe('Tipo de emergencia');
    return crearAlerta.calls.mostRecent().args[0].buttons![1] as AlertButton;
  }

  it('cancela el SOS si se suelta antes de completar la pulsación', () => {
    jasmine.clock().install();
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.currentUser = usuario;
    app.iniciarSostenidoSos();
    jasmine.clock().tick(1000);
    expect(app.sosSosteniendo).toBeTrue();
    app.cancelarSostenidoSos();
    jasmine.clock().tick(400);
    expect(app.sosSosteniendo).toBeFalse();
    expect(crearAlerta).not.toHaveBeenCalled();
  });

  it('pide un tipo y luego envía el SOS con la unidad aunque no haya permiso de GPS', async () => {
    jasmine.clock().install();
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const enviar = abrirSos(app).handler!;
    expect(await enviar(undefined)).toBeFalse();
    expect(crearAlerta.calls.mostRecent().args[0].header).toBe('Elige un tipo');
    expect(agregarAviso).not.toHaveBeenCalled();

    expect(await enviar('Incendio')).toBeTrue();
    expect(agregarAviso).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      descripcionAviso: 'Incendio', comunidadId: 'comunidad-1', ubicacionAviso: 'Torre 2 - Apto 301',
    }));
    expect(crearAlerta.calls.mostRecent().args[0].header).toContain('Alerta SOS enviada');
  });

  it('exige una descripción para otra emergencia', async () => {
    jasmine.clock().install();
    const app = TestBed.createComponent(AppComponent).componentInstance;
    await abrirSos(app).handler!('Otra emergencia');
    const formulario = crearAlerta.calls.mostRecent().args[0];
    expect(formulario.header).toBe('Describe la emergencia');
    const enviar = (formulario.buttons![1] as AlertButton).handler!;
    expect(enviar({ descripcion: ' ' })).toBeFalse();
    expect(agregarAviso).not.toHaveBeenCalled();
    const guardado = new Promise<void>(resolve => {
      agregarAviso.and.callFake(() => {
        resolve();
        return of('aviso-1');
      });
    });
    expect(enviar({ descripcion: '  Daño en la entrada  ' })).toBeTrue();
    await guardado;
    expect(agregarAviso).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      descripcionAviso: 'Otra emergencia: Daño en la entrada',
    }));
  });

  it('confirma que el SOS quedó en cola sin esperar la escritura cuando no hay conexión', async () => {
    jasmine.clock().install();
    const app = TestBed.createComponent(AppComponent).componentInstance;
    spyOnProperty(TestBed.inject(ConexionService), 'enLinea', 'get').and.returnValue(false);
    agregarAviso.and.returnValue(NEVER);
    expect(await abrirSos(app).handler!('Incendio')).toBeTrue();
    expect(agregarAviso).toHaveBeenCalledTimes(1);
    expect(crearAlerta.calls.mostRecent().args[0].header).toContain('alerta guardada');
  });

  it('avisa cuando falla el envío del SOS', async () => {
    jasmine.clock().install();
    spyOn(console, 'error');
    agregarAviso.and.returnValue(throwError(() => new Error('Sin conexión')));
    const app = TestBed.createComponent(AppComponent).componentInstance;
    expect(await abrirSos(app).handler!('Incendio')).toBeFalse();
    expect(crearAlerta.calls.mostRecent().args[0].message).toContain('No se pudo enviar la alerta');
  });

  it('cierra el menú y abre Mensajes', async () => {
    jasmine.clock().install();
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const navegar = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    app.goToMensajes();
    await Promise.resolve();
    await Promise.resolve();
    jasmine.clock().tick(900);
    expect(cerrarMenu).toHaveBeenCalledOnceWith('main-menu');
    expect(navegar).toHaveBeenCalledOnceWith('/mensajes');
    expect(app.showSplash).toBeFalse();
  });

  it('vuelve al login al cerrar sesión si no hace falta recargar', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const navegar = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    await app.logout();
    expect(navegar).toHaveBeenCalledOnceWith(['/login']);
  });

  it('muestra ayuda de instalación en iOS y avisa si la instalación no está disponible', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.showIosInstallHelp = true;
    await app.installPwa();
    expect(crearAlerta.calls.mostRecent().args[0].header).toBe('Instalar AlertBxt');

    app.showIosInstallHelp = false;
    await app.installPwa();
    expect(crearAlerta.calls.mostRecent().args[0].header).toBe('Instalación no disponible');
  });

  it('inicia FCM para el usuario cuando se conceden permisos', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const iniciar = spyOn(TestBed.inject(FcmService), 'iniciarParaUsuario').and.resolveTo();
    spyOn(TestBed.inject(LocalNotificationService), 'enableNotifications').and.resolveTo('granted');
    app.currentUser = usuario;

    await app.enableNotifications();

    expect(iniciar).toHaveBeenCalledOnceWith(usuario);
    expect(crearAlerta.calls.mostRecent().args[0].message).toContain('quedaron activadas');
  });

});
