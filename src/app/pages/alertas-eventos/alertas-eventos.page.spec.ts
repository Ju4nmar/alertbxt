import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { Aviso, Notificacion, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { AlertasEventosPage } from './alertas-eventos.page';

describe('AlertasEventosPage', () => {
  let component: AlertasEventosPage;
  let fixture: ComponentFixture<AlertasEventosPage>;
  const residente: Usuario = {
    idUsuario: 'residente-1', nombre: 'Ana', correo: '', telefono: '',
    comunidadId: 'comunidad-1', activo: true, rol: 'propietario',
  };
  const alerta: Aviso = {
    idAviso: 'sos-1', tituloAviso: 'Alerta SOS', descripcionAviso: 'Solicito ayuda',
    tipoAviso: 'alerta', estado: 'pendiente', fechaPublicacion: '2026-10-01T12:00:00Z',
    autorId: 'residente-1', comunidadId: 'comunidad-1', latitud: 3.2, longitud: -76.4,
  };
  const notificacion: Notificacion = {
    idNotificaciones: 'n-1', tituloNotificacion: 'Reunión',
    descripcionNotificacion: 'Reunión de residentes', fechaHora: '2026-10-02T12:00:00Z',
    comunidadId: 'comunidad-1',
  };
  let usuario: BehaviorSubject<Usuario | null>;
  let firestore: FirestoreService;

  beforeEach(async () => {
    usuario = new BehaviorSubject<Usuario | null>(null);
    await TestBed.configureTestingModule({
      imports: [AlertasEventosPage],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUser$: usuario,
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            isLoading$: of(false),
            getAvisosByComunidad: () => of([]),
            getNotificacionesByUsuario: () => of([]),
            getNotificacionesVisibles: () => of([]),
            getUsuarioById: () => of(null),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AlertasEventosPage);
    component = fixture.componentInstance;
    firestore = TestBed.inject(FirestoreService);
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('excluye SOS rechazadas, resuelve el autor una sola vez y ordena las tarjetas', () => {
    spyOn(firestore, 'getAvisosByComunidad').and.returnValue(of([
      alerta, { ...alerta, idAviso: 'sos-2', estado: 'rechazado' },
    ]));
    spyOn(firestore, 'getNotificacionesVisibles').and.returnValue(of([notificacion]));
    const consultarAutor = spyOn(firestore, 'getUsuarioById').and.returnValue(of(residente));

    usuario.next(residente);

    expect(consultarAutor).toHaveBeenCalledOnceWith('residente-1');
    expect(component.avisos.map(aviso => aviso.autorNombre)).toEqual(['Ana']);
    expect(component.tarjetasVisibles.map(tarjeta => tarjeta.id)).toEqual(['n-1', 'sos-1']);
    expect(component.totalEmergencias).toBe(1);

    component.cambiarFiltro('aviso');
    expect(component.tarjetasVisibles.map(tarjeta => tarjeta.id)).toEqual(['sos-1']);
    component.cambiarFiltro('notificacion');
    expect(component.tarjetasVisibles.map(tarjeta => tarjeta.id)).toEqual(['n-1']);
    component.cambiarFiltro('todos');
    expect(component.tarjetasVisibles.length).toBe(2);
  });

  it('abre y cierra los detalles de avisos y notificaciones', () => {
    spyOn(firestore, 'getAvisosByComunidad').and.returnValue(of([{ ...alerta, autorNombre: 'Ana' }]));
    spyOn(firestore, 'getNotificacionesVisibles').and.returnValue(of([notificacion]));
    usuario.next(residente);
    const [tarjetaNotificacion, tarjetaAviso] = component.tarjetas;

    component.abrirModal(tarjetaAviso);
    expect(component.modalAbierto).toBeTrue();
    expect(component.modalData).toEqual(jasmine.objectContaining({
      variant: 'aviso', autor: 'Ana', enlaceMapa: jasmine.any(String),
    }));
    component.cerrarModal();
    expect(component.modalAbierto).toBeFalse();
    expect(component.modalData).toBeNull();

    component.abrirModal(tarjetaNotificacion);
    expect(component.modalData).toEqual(jasmine.objectContaining({
      variant: 'notificacion', titulo: 'Reunión',
    }));
  });

  it('mantiene las notificaciones visibles si falla la consulta de avisos', () => {
    spyOn(console, 'error');
    spyOn(firestore, 'getAvisosByComunidad').and.returnValue(throwError(() => new Error('sin conexión')));
    spyOn(firestore, 'getNotificacionesVisibles').and.returnValue(of([notificacion]));

    usuario.next(residente);

    expect(component.cargaError).toContain('cargar los avisos');
    expect(component.tarjetas.map(tarjeta => tarjeta.id)).toEqual(['n-1']);
  });

  it('cuenta como pendiente solo la notificación futura que sigue activa', () => {
    const futuro = new Date(Date.now() + 60_000).toISOString();
    spyOn(firestore, 'getNotificacionesVisibles').and.returnValue(of([
      { ...notificacion, fechaHora: futuro },
      { ...notificacion, idNotificaciones: 'completada', fechaHora: futuro, estado: 'completado' },
      { ...notificacion, idNotificaciones: 'vencida', fechaHora: '2000-01-01T00:00:00Z' },
    ]));

    usuario.next(residente);

    expect(component.totalPendientes).toBe(1);
    expect(component.esFuturo(futuro)).toBeTrue();
  });
});
