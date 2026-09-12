import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Storage } from '@angular/fire/storage';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ImageOptimizerService } from '../../services/image-optimizer.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { GestionAvisosPage } from './gestion-avisos.page';

describe('GestionAvisosPage', () => {
  let component: GestionAvisosPage;
  let fixture: ComponentFixture<GestionAvisosPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionAvisosPage],
      providers: [
        { provide: Storage, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            currentUser$: of(null),
            getCurrentUser: () => null,
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            isLoading$: of(false),
            getAvisosByComunidad: () => of([]),
            addAviso: () => of('aviso-1'),
            updateAviso: () => of(void 0),
            deleteAviso: () => of(void 0),
          },
        },
        {
          provide: ImageOptimizerService,
          useValue: {
            optimize: (file: File) => Promise.resolve({
              file,
              originalSize: file.size,
              optimizedSize: file.size,
              convertedToWebp: false,
            }),
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
    fixture = TestBed.createComponent(GestionAvisosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('separa las alertas SOS para moderación y evita editarlas', () => {
    const alertaSos = {
      idAviso: 'sos-1',
      tituloAviso: 'Alerta SOS',
      descripcionAviso: 'Necesito ayuda',
      tipoAviso: 'alerta',
      fechaPublicacion: '2026-09-10T10:00:00.000Z',
      autorId: 'residente-1',
      comunidadId: 'comunidad-1',
    };
    const avisoAdministrativo = {
      idAviso: 'aviso-1',
      tituloAviso: 'Mantenimiento',
      descripcionAviso: 'Mantenimiento programado',
      tipoAviso: 'mantenimiento',
      fechaPublicacion: '2026-09-10T09:00:00.000Z',
      autorId: 'admin-1',
      comunidadId: 'comunidad-1',
    };
    const alertaSosAnterior = {
      ...alertaSos,
      idAviso: 'sos-0',
      fechaPublicacion: '2026-09-10T08:00:00.000Z',
    };

    component.organizarAvisos([alertaSosAnterior, avisoAdministrativo, alertaSos]);
    component.editarAviso(alertaSos);

    expect(component.avisosAdministrativos).toEqual([avisoAdministrativo]);
    expect(component.alertasSos).toEqual([alertaSos, alertaSosAnterior]);
    expect(component.idEditando).toBeNull();
    expect(component.avisoError).toContain('no se pueden editar');
  });
});
