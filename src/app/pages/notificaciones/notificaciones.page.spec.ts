import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { NotificacionesPage } from './notificaciones.page';

describe('NotificacionesPage', () => {
  let component: NotificacionesPage;
  let fixture: ComponentFixture<NotificacionesPage>;
  let addNotificacionSpy: jasmine.Spy;

  beforeEach(async () => {
    addNotificacionSpy = jasmine.createSpy('addNotificacion').and.returnValue(of('notificacion-1'));

    await TestBed.configureTestingModule({
      imports: [NotificacionesPage],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUser$: of(null),
            getCurrentUser: () => ({
              idUsuario: 'residente-1',
              nombre: 'Residente',
              correo: 'residente@alertbxt.test',
              telefono: '3000000000',
              rol: 'residente',
              activo: true,
              comunidadId: 'comunidad-1',
            }),
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            getNotificacionesByUsuario: () => of([]),
            getNotificacionesVisibles: () => of([]),
            addNotificacion: addNotificacionSpy,
            updateNotificacion: () => of(void 0),
            deleteNotificacion: () => of(void 0),
          },
        },
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

  it('rechaza crear una notificación con fecha y hora en el pasado', async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    component.tituloNotificacion = 'Notificación vencida';
    component.descripcionNotificacion = 'No debería poder guardarse';
    component.fechaNotificacion = ayer.toISOString().slice(0, 10);
    component.horaNotificacion = '09:00';

    await component.guardarNotificacion();

    expect(component.notificacionError).toBe('La fecha y hora de la notificación deben ser futuras.');
    expect(addNotificacionSpy).not.toHaveBeenCalled();
  });

  it('permite crear una notificación con fecha y hora futuras', async () => {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    component.tituloNotificacion = 'Notificación válida';
    component.descripcionNotificacion = 'Debería poder guardarse';
    component.fechaNotificacion = manana.toISOString().slice(0, 10);
    component.horaNotificacion = '09:00';

    await component.guardarNotificacion();

    expect(component.notificacionError).toBe('');
    expect(addNotificacionSpy).toHaveBeenCalled();
  });
});
