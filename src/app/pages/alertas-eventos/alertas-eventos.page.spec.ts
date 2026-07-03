import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { AlertasEventosPage } from './alertas-eventos.page';

describe('AlertasEventosPage', () => {
  let component: AlertasEventosPage;
  let fixture: ComponentFixture<AlertasEventosPage>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlertasEventosPage],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUser$: of(null),
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            isLoading$: of(false),
            getAvisosByComunidad: () => of([]),
            getRecordatoriosByUsuario: () => of([]),
            getUsuarioById: () => of(null),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AlertasEventosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

