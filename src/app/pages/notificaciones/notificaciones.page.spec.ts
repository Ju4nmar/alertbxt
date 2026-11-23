import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular/standalone';
import type { AlertButton, AlertOptions } from '@ionic/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { Notificacion, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { ToastService } from '../../services/toast.service';
import { NotificacionesPage } from './notificaciones.page';

describe('NotificacionesPage', () => {
  let component: NotificacionesPage;
  let fixture: ComponentFixture<NotificacionesPage>;
  let addNotificacionSpy: jasmine.Spy;
  let sesion: BehaviorSubject<Usuario | null>;
  let crearAlerta: jasmine.Spy<(options: AlertOptions) => Promise<{ present: jasmine.Spy }>>;
  const residente: Usuario = {
    idUsuario: 'residente-1',
    nombre: 'Residente',
    correo: 'residente@alertbxt.test',
    telefono: '3000000000',
    rol: 'residente',
    activo: true,
    comunidadId: 'comunidad-1',
  };
  const admin: Usuario = { ...residente, idUsuario: 'admin-1', rol: 'admin' };
  const fechaLocal = '2099-06-12T09:30';
  const aviso: Notificacion = {
    idNotificaciones: 'notificacion-1',
    tituloNotificacion: 'Reunión',
    descripcionNotificacion: 'Reunión de vecinos',
    fechaHora: new Date(fechaLocal).toISOString(),
    fechaCreacion: '2026-01-01T00:00:00Z',
    comunidadId: 'comunidad-1',
    autorId: 'admin-1',
    usuariosAsignados: ['residente-1'],
  };

  beforeEach(async () => {
    addNotificacionSpy = jasmine.createSpy('addNotificacion').and.returnValue(of('notificacion-1'));
    sesion = new BehaviorSubject<Usuario | null>(null);
    crearAlerta = jasmine.createSpy('create').and.resolveTo({
      present: jasmine.createSpy('present').and.resolveTo(),
    });

    await TestBed.configureTestingModule({
      imports: [NotificacionesPage],
      providers: [
        { provide: AlertController, useValue: { create: crearAlerta } },
        {
          provide: AuthService,
          useValue: {
            currentUser$: sesion,
            getCurrentUser: () => sesion.value ?? residente,
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            getNotificacionesByUsuario: () => of([]),
            getNotificacionesVisibles: () => of([aviso]),
            getUsuariosByComunidad: () => of([
              { ...residente, idUsuario: 'vecino-2', nombre: 'Zoe', torre: '7' },
              admin,
              { ...residente, nombre: 'Ana', torre: '4' },
            ]),
            crearNotificacionAsignada: jasmine.createSpy('crearNotificacionAsignada').and.returnValue(of(void 0)),
            addNotificacion: addNotificacionSpy,
            updateNotificacion: () => of(void 0),
            deleteNotificacion: () => of(void 0),
          },
        },
        { provide: ToastService, useValue: { success: jasmine.createSpy('success').and.resolveTo() } },
        {
          provide: LocalNotificationService,
          useValue: {
            showNotification: () => undefined,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificacionesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('carga las notificaciones y ordena los vecinos del administrador excluyéndolo', () => {
    const cargar = spyOn(TestBed.inject(FirestoreService), 'getNotificacionesVisibles').and.callThrough();
    sesion.next(admin);
    sesion.next({ ...admin });

    expect(cargar).toHaveBeenCalledOnceWith(admin);
    expect(component.notificaciones).toEqual([aviso]);
    expect(component.isLoadingLista).toBeFalse();
    expect(component.comunidadUsuarios.map(vecino => vecino.nombre)).toEqual(['Ana', 'Zoe']);
    expect(component.origenNotificacion(aviso)).toBe('Asignado por ti a 1 vecino');
  });

  it('asigna solo a los vecinos seleccionados mediante el filtro', async () => {
    const guardar = TestBed.inject(FirestoreService).crearNotificacionAsignada;
    sesion.next(admin);
    component.tituloNotificacion = ' Reunión ';
    component.descripcionNotificacion = aviso.descripcionNotificacion;
    component.fechaNotificacion = '2099-06-12';
    component.horaNotificacion = '09:30';
    component.elegirModoAsignacion('elegir');

    await component.guardarNotificacion();
    expect(component.notificacionError).toContain('Selecciona al menos un vecino');
    expect(guardar).not.toHaveBeenCalled();

    component.filtroVecino = ' ANA ';
    component.seleccionarVisibles();
    expect(component.cantidadAsignados).toBe(1);
    await component.guardarNotificacion();

    expect(guardar).toHaveBeenCalledOnceWith({
      titulo: 'Reunión', descripcion: aviso.descripcionNotificacion, fechaHora: aviso.fechaHora,
      usuarioIds: ['residente-1'], paraTodos: false,
    });
    expect(component.cantidadAsignados).toBe(0);
    expect(component.modoAsignacion).toBe('yo');
  });

  it('edita el contenido de una notificación asignada conservando sus destinatarios', async () => {
    const actualizar = spyOn(TestBed.inject(FirestoreService), 'updateNotificacion').and.callThrough();
    sesion.next(residente);
    component.editarNotificacion(aviso);
    expect(component.idEditando).toBeNull();

    sesion.next(admin);
    component.editarNotificacion(aviso);
    expect(component.editandoAsignado).toBeTrue();
    expect(component.fechaNotificacion).toBe('2099-06-12');
    expect(component.horaNotificacion).toBe('09:30');
    component.tituloNotificacion = 'Nueva reunión';
    await component.guardarNotificacion();

    expect(actualizar).toHaveBeenCalledOnceWith('notificacion-1', {
      tituloNotificacion: 'Nueva reunión',
      descripcionNotificacion: aviso.descripcionNotificacion,
      fechaHora: aviso.fechaHora,
    });
    expect(component.idEditando).toBeNull();
  });

  it('libera el formulario y conserva los datos si falla el guardado', async () => {
    spyOn(console, 'error');
    addNotificacionSpy.and.returnValue(throwError(() => new Error('Sin conexión')));
    component.tituloNotificacion = aviso.tituloNotificacion;
    component.descripcionNotificacion = aviso.descripcionNotificacion;
    component.fechaNotificacion = '2099-06-12';
    component.horaNotificacion = '09:30';

    await component.guardarNotificacion();

    expect(component.notificacionError).toBe('Sin conexión');
    expect(component.isLoading).toBeFalse();
    expect(component.tituloNotificacion).toBe(aviso.tituloNotificacion);
  });

  it('elimina una notificación propia solo después de confirmar', async () => {
    const eliminar = spyOn(TestBed.inject(FirestoreService), 'deleteNotificacion').and.callThrough();
    sesion.next(residente);
    await component.eliminarNotificacion(aviso);
    expect(crearAlerta).not.toHaveBeenCalled();

    await component.eliminarNotificacion({ ...aviso, idUsuario: residente.idUsuario });
    expect(eliminar).not.toHaveBeenCalled();
    const botones = crearAlerta.calls.mostRecent().args[0].buttons as AlertButton[];
    await botones.find(boton => boton.role === 'destructive')!.handler!(undefined);

    expect(eliminar).toHaveBeenCalledOnceWith('notificacion-1');
    expect(TestBed.inject(ToastService).success).toHaveBeenCalledOnceWith('Notificación eliminada');
    expect(component.isLoading).toBeFalse();
  });

  it('rechaza crear una notificación con fecha y hora en el pasado', async () => {
    component.tituloNotificacion = 'Notificación vencida';
    component.descripcionNotificacion = 'No debería poder guardarse';
    component.fechaNotificacion = '2000-01-01';
    component.horaNotificacion = '09:00';

    await component.guardarNotificacion();

    expect(component.notificacionError).toBe('La fecha y hora de la notificación deben ser futuras.');
    expect(addNotificacionSpy).not.toHaveBeenCalled();
  });

  it('permite crear una notificación con fecha y hora futuras', async () => {
    component.tituloNotificacion = 'Notificación válida';
    component.descripcionNotificacion = 'Debería poder guardarse';
    component.fechaNotificacion = '2099-06-12';
    component.horaNotificacion = '09:00';

    await component.guardarNotificacion();

    expect(component.notificacionError).toBe('');
    expect(addNotificacionSpy).toHaveBeenCalled();
  });
});
