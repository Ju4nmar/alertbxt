import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { PerfilUsuarioPage } from './perfil-usuario.page';

describe('PerfilUsuarioPage', () => {
  let component: PerfilUsuarioPage;
  let fixture: ComponentFixture<PerfilUsuarioPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PerfilUsuarioPage],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUser$: of(null),
            getCurrentUser: () => null,
            setCurrentUser: () => undefined,
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            getComunidadById: () => of(null),
            addUsuario: () => of(void 0),
            updateComunidad: () => of(void 0),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PerfilUsuarioPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
