import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let auth: jasmine.SpyObj<AuthService>;
  let navegar: jasmine.Spy;
  const vecino: Usuario = {
    idUsuario: 'vecino-1', nombre: 'Ana', correo: 'ana@alertbxt.test',
    telefono: '3000000000', rol: 'propietario', activo: true, comunidadId: 'comunidad-1',
  };

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'loginWithGoogle']);
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: auth,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    navegar = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('valida las credenciales y solo envía una solicitud mientras carga', async () => {
    await component.login();
    expect(component.loginError).toBe('Ingresa tu correo y contraseña.');
    component.email = 'correo-invalido';
    component.password = 'password123';
    await component.login();
    expect(component.loginError).toBe('Revisa el correo y la contraseña.');
    expect(auth.login).not.toHaveBeenCalled();

    const sesion = new Subject<Usuario>();
    auth.login.and.returnValue(sesion);
    component.email = ' ana@alertbxt.test ';
    const ingreso = component.login();
    await component.login();
    await component.loginWithGoogle();
    expect(component.isLoading).toBeTrue();
    expect(auth.login).toHaveBeenCalledOnceWith('ana@alertbxt.test', 'password123');
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();
    sesion.next(vecino);
    await ingreso;
    expect(navegar).toHaveBeenCalledOnceWith(['/inicio']);
    expect(component.isLoading).toBeFalse();
  });

  for (const [code, mensaje] of [
    ['auth/invalid-credential', 'Correo o contraseña incorrectos.'],
    ['auth/too-many-requests', 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.'],
    ['auth/invalid-email', 'El formato del correo no es válido.'],
    ['auth/network-request-failed', 'No se pudo iniciar sesión. Revisa tus datos e inténtalo nuevamente.'],
  ]) {
    it(`traduce el error ${code} y habilita el formulario`, async () => {
      spyOn(console, 'error');
      auth.login.and.returnValue(throwError(() => ({ code })));
      component.email = vecino.correo;
      component.password = 'password123';
      await component.login();
      expect(component.loginError).toBe(mensaje);
      expect(component.isLoading).toBeFalse();
      expect(navegar).not.toHaveBeenCalled();
    });
  }

  it('avisa si la cuenta fue desactivada', async () => {
    spyOn(console, 'error');
    auth.login.and.returnValue(throwError(() => new Error('cuenta-desactivada')));
    component.email = vecino.correo;
    component.password = 'password123';
    await component.login();
    expect(component.loginError).toContain('Tu cuenta ha sido desactivada');
  });

  it('redirige a Unirse a vecindad cuando Google devuelve una cuenta sin comunidad', async () => {
    auth.loginWithGoogle.and.returnValue(of({ ...vecino, comunidadId: '' }));
    await component.loginWithGoogle();
    expect(navegar).toHaveBeenCalledOnceWith(['/unirse-vecindad']);
    expect(component.isGoogleLoading).toBeFalse();
  });

  for (const [error, mensaje] of [
    [{ code: 'auth/popup-closed-by-user' }, ''],
    [new Error('cuenta-desactivada'), 'Tu cuenta ha sido desactivada. Contacta a un administrador de tu conjunto.'],
    [new Error('No hay perfil para esta cuenta'), 'No hay perfil para esta cuenta'],
    [{ code: 'auth/network-request-failed' }, 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.'],
  ] as const) {
    it(`gestiona el resultado fallido de Google: ${mensaje || 'ventana cerrada'}`, async () => {
      spyOn(console, 'error');
      auth.loginWithGoogle.and.returnValue(throwError(() => error));
      await component.loginWithGoogle();
      expect(component.loginError).toBe(mensaje);
      expect(component.isGoogleLoading).toBeFalse();
      expect(navegar).not.toHaveBeenCalled();
    });
  }

  it('abre el registro, la invitación y la recuperación desde la pantalla de ingreso', () => {
    component.goToRegistro();
    component.goToUnirseVecindad();
    component.goToForgotPassword();
    expect(navegar.calls.allArgs()).toEqual([[['/registro']], [['/unirse-vecindad']], [['/forgot-password']]]);
  });
});
