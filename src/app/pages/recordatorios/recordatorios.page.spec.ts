import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { RecordatoriosPage } from './recordatorios.page';

describe('RecordatoriosPage', () => {
  let component: RecordatoriosPage;
  let fixture: ComponentFixture<RecordatoriosPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordatoriosPage],
      providers: [
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
            getRecordatoriosByUsuario: () => of([]),
            addRecordatorio: () => of('recordatorio-1'),
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
});
