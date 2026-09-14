import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UnirseVecindadPage } from './unirse-vecindad.page';

describe('UnirseVecindadPage', () => {
  let component: UnirseVecindadPage;
  let fixture: ComponentFixture<UnirseVecindadPage>;
  let authServiceSpy: jasmine.SpyObj<Pick<AuthService, 'joinComunidad' | 'registerResidentAndJoinComunidad'>>;

  beforeEach(async () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['joinComunidad', 'registerResidentAndJoinComunidad']);

    await TestBed.configureTestingModule({
      imports: [UnirseVecindadPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        {
          provide: AuthService,
          useValue: {
            authReady$: of(true),
            currentUser$: of(null),
            ...authServiceSpy,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UnirseVecindadPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('rechaza un código de invitación con formato inválido sin llamar al servicio', async () => {
    component.codigoInvitacion = 'abc123';
    component.nombre = 'Vecino de prueba';
    component.correo = 'vecino@alertbxt.test';
    component.telefono = '3000000000';
    component.numeroApartamento = '101';
    component.password = 'password123';
    component.confirmPassword = 'password123';

    await component.joinComunidad();

    expect(component.joinError).toContain('El código debe tener 8 letras o números.');
    expect(authServiceSpy.registerResidentAndJoinComunidad).not.toHaveBeenCalled();
    expect(authServiceSpy.joinComunidad).not.toHaveBeenCalled();
  });

  it('exige aceptar el tratamiento de datos personales antes de registrarse', async () => {
    component.codigoInvitacion = 'ABCD1234';
    component.nombre = 'Vecino de prueba';
    component.correo = 'vecino@alertbxt.test';
    component.telefono = '3000000000';
    component.numeroApartamento = '101';
    component.password = 'password123';
    component.confirmPassword = 'password123';
    component.aceptaTerminos = false;

    await component.joinComunidad();

    expect(component.joinError).toBe('Debes aceptar el tratamiento de tus datos personales.');
    expect(authServiceSpy.registerResidentAndJoinComunidad).not.toHaveBeenCalled();
  });

  it('muestra un error claro cuando el código tiene el formato correcto pero no existe', async () => {
    authServiceSpy.registerResidentAndJoinComunidad.and.returnValue(
      throwError(() => new Error('Código de invitación inválido'))
    );

    component.codigoInvitacion = 'ABCD1234';
    component.nombre = 'Vecino de prueba';
    component.correo = 'vecino@alertbxt.test';
    component.telefono = '3000000000';
    component.numeroApartamento = '101';
    component.password = 'password123';
    component.confirmPassword = 'password123';
    component.aceptaTerminos = true;

    await component.joinComunidad();

    expect(authServiceSpy.registerResidentAndJoinComunidad).toHaveBeenCalled();
    expect(component.joinError).toBe('El código de invitación no es válido.');
  });
});
