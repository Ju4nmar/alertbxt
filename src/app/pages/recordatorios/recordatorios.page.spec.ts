import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { RecordatoriosPage } from './recordatorios.page';

describe('RecordatoriosPage', () => {
  let component: RecordatoriosPage;
  let fixture: ComponentFixture<RecordatoriosPage>;
  let addRecordatorioSpy: jasmine.Spy;

  beforeEach(async () => {
    addRecordatorioSpy = jasmine.createSpy('addRecordatorio').and.returnValue(of('recordatorio-1'));

    await TestBed.configureTestingModule({
      imports: [RecordatoriosPage],
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
            getRecordatoriosByUsuario: () => of([]),
            getRecordatoriosVisibles: () => of([]),
            addRecordatorio: addRecordatorioSpy,
            updateRecordatorio: () => of(void 0),
            deleteRecordatorio: () => of(void 0),
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
    fixture = TestBed.createComponent(RecordatoriosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('rechaza crear un recordatorio con fecha y hora en el pasado', async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    component.tituloRecordatorio = 'Recordatorio vencido';
    component.descripcionRecordatorio = 'No debería poder guardarse';
    component.fechaRecordatorio = ayer.toISOString().slice(0, 10);
    component.horaRecordatorio = '09:00';

    await component.guardarRecordatorio();

    expect(component.recordatorioError).toBe('La fecha y hora del recordatorio deben ser futuras.');
    expect(addRecordatorioSpy).not.toHaveBeenCalled();
  });

  it('permite crear un recordatorio con fecha y hora futuras', async () => {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    component.tituloRecordatorio = 'Recordatorio válido';
    component.descripcionRecordatorio = 'Debería poder guardarse';
    component.fechaRecordatorio = manana.toISOString().slice(0, 10);
    component.horaRecordatorio = '09:00';

    await component.guardarRecordatorio();

    expect(component.recordatorioError).toBe('');
    expect(addRecordatorioSpy).toHaveBeenCalled();
  });
});
