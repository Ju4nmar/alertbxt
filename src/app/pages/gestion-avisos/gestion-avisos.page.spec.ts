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
});
