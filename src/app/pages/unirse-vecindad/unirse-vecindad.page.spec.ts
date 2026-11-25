import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { UnirseVecindadPage } from './unirse-vecindad.page';

describe('UnirseVecindadPage', () => {
  let component: UnirseVecindadPage;
  let fixture: ComponentFixture<UnirseVecindadPage>;
  type OperacionesIngreso = Pick<AuthService, 'joinComunidad' | 'registerResidentAndJoinComunidad' | 'joinComunidadWithGoogle'>;
  let authServiceSpy: jasmine.SpyObj<OperacionesIngreso>;
  let authReady: BehaviorSubject<boolean>;
  let sesion: BehaviorSubject<Usuario | null>;
  let navegar: jasmine.Spy;
  const comunidad = { idComunidad: 'comunidad-1', nombreComunidad: 'El Bosque', tipoComunidad: 'casas' as const };
  const usuario: Usuario = {
    idUsuario: 'vecino-1', nombre: 'Vecino de prueba', correo: 'vecino@alertbxt.test',
    telefono: '3000000000', rol: 'propietario', activo: true, comunidadId: 'comunidad-1',
  };

  beforeEach(async () => {
    authServiceSpy = jasmine.createSpyObj<OperacionesIngreso>('AuthService', [
      'joinComunidad', 'registerResidentAndJoinComunidad', 'joinComunidadWithGoogle',
    ]);
    authReady = new BehaviorSubject(false);
    sesion = new BehaviorSubject<Usuario | null>(null);

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
            authReady$: authReady,
            currentUser$: sesion,
            ...authServiceSpy,
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            getComunidadByCodigoInvitacion: () => of(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UnirseVecindadPage);
    navegar = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function rellenarFormulario(): void {
    Object.assign(component, {
      codigoInvitacion: ' abcd1234 ', nombre: ' Vecino de prueba ',
      correo: ' vecino@alertbxt.test ', telefono: ' 3000000000 ',
      numeroApartamento: ' 101 ', torre: ' 5 ', password: 'password123',
      confirmPassword: 'password123', aceptaTerminos: true,
    });
  }

  it('espera la sesión antes de precargar datos y une una cuenta existente con el código normalizado', async () => {
    sesion.next(usuario);
    expect(component.isLoggedIn).toBeFalse();
    authReady.next(true);
    expect(component.isLoggedIn).toBeTrue();
    expect(component.correo).toBe(usuario.correo);
    const ingreso = new Subject<{ comunidad: typeof comunidad; usuario: Usuario }>();
    authServiceSpy.joinComunidad.and.returnValue(ingreso);
    component.codigoInvitacion = ' abcd1234 ';
    const unir = component.joinComunidad();
    await component.joinComunidad();
    expect(component.isLoading).toBeTrue();
    expect(authServiceSpy.joinComunidad).toHaveBeenCalledOnceWith('ABCD1234');
    expect(authServiceSpy.registerResidentAndJoinComunidad).not.toHaveBeenCalled();
    ingreso.next({ comunidad, usuario });
    await unir;
    expect(navegar).toHaveBeenCalledOnceWith(['/inicio']);
    expect(component.isLoading).toBeFalse();
  });

  it('consulta el tipo de vecindad y registra residentes de casas sin torre', async () => {
    const consultar = spyOn(TestBed.inject(FirestoreService), 'getComunidadByCodigoInvitacion')
      .and.returnValue(of(comunidad));
    authServiceSpy.registerResidentAndJoinComunidad.and.returnValue(of({ comunidad, usuario }));
    rellenarFormulario();
    component.rolElegido = 'arrendatario';
    component.onCodigoInvitacionChange();
    expect(consultar).toHaveBeenCalledOnceWith('ABCD1234');
    expect(component.esComunidadDeCasas).toBeTrue();
    await component.joinComunidad();
    expect(authServiceSpy.registerResidentAndJoinComunidad).toHaveBeenCalledOnceWith({
      codigoInvitacion: 'ABCD1234', aceptaTerminos: true, rolElegido: 'arrendatario',
      nombre: usuario.nombre, correo: usuario.correo, telefono: usuario.telefono,
      numeroApartamento: '101', torre: undefined, password: 'password123',
    });
    expect(navegar).toHaveBeenCalledOnceWith(['/inicio']);
    consultar.and.returnValue(throwError(() => new Error('offline')));
    component.onCodigoInvitacionChange();
    expect(component.tipoComunidadPreview).toBeNull();
  });

  for (const [campos, mensaje] of [
    [{ nombre: '' }, 'Completa todos los campos requeridos.'],
    [{ torre: '' }, 'Ingresa la torre de tu apartamento.'],
    [{ password: 'corta' }, 'Revisa la longitud de los campos del formulario.'],
    [{ correo: 'incorrecto' }, 'Revisa el formato del correo o del teléfono.'],
    [{ confirmPassword: 'otroPassword' }, 'Las contraseñas no coinciden.'],
  ] as const) {
    it(`valida el formulario: ${mensaje}`, async () => {
      rellenarFormulario();
      Object.assign(component, campos);
      await component.joinComunidad();
      expect(component.joinError).toBe(mensaje);
      expect(authServiceSpy.registerResidentAndJoinComunidad).not.toHaveBeenCalled();
    });
  }

  for (const [code, mensaje] of [
    ['auth/email-already-in-use', 'Este correo ya está registrado. Inicia sesión para unirte.'],
    ['auth/invalid-email', 'El correo no tiene un formato válido.'],
    ['auth/weak-password', 'La contraseña es demasiado débil.'],
    ['auth/network-request-failed', 'No se pudo unir a la vecindad. Intenta nuevamente.'],
  ]) {
    it(`traduce el error de registro ${code}`, async () => {
      spyOn(console, 'error');
      rellenarFormulario();
      authServiceSpy.registerResidentAndJoinComunidad.and.returnValue(throwError(() => ({ code })));
      await component.joinComunidad();
      expect(component.joinError).toBe(mensaje);
      expect(component.isLoading).toBeFalse();
      expect(navegar).not.toHaveBeenCalled();
    });
  }

  it('valida el código y el consentimiento antes de abrir Google', async () => {
    await component.joinWithGoogle();
    expect(component.joinError).toContain('código de invitación válido');
    component.codigoInvitacion = ' abcd1234 ';
    await component.joinWithGoogle();
    expect(component.joinError).toContain('aceptar el tratamiento');
    expect(authServiceSpy.joinComunidadWithGoogle).not.toHaveBeenCalled();

    component.aceptaTerminos = true;
    component.rolElegido = 'arrendatario';
    authServiceSpy.joinComunidadWithGoogle.and.returnValue(of({ comunidad, usuario }));
    await component.joinWithGoogle();
    expect(authServiceSpy.joinComunidadWithGoogle).toHaveBeenCalledOnceWith('ABCD1234', true, 'arrendatario');
    expect(navegar).toHaveBeenCalledOnceWith(['/inicio']);
  });

  for (const [error, mensaje] of [
    [{ code: 'auth/popup-closed-by-user' }, ''],
    [new Error('Código vencido'), 'Código vencido'],
    [{ code: 'auth/network-request-failed' }, 'No se pudo unir con Google. Inténtalo de nuevo.'],
  ] as const) {
    it(`recupera el formulario de Google: ${mensaje || 'ventana cerrada'}`, async () => {
      spyOn(console, 'error');
      rellenarFormulario();
      authServiceSpy.joinComunidadWithGoogle.and.returnValue(throwError(() => error));
      await component.joinWithGoogle();
      expect(component.joinError).toBe(mensaje);
      expect(component.isGoogleLoading).toBeFalse();
      expect(navegar).not.toHaveBeenCalled();
    });
  }

  it('vuelve a iniciar sesión desde la pantalla de invitación', () => {
    component.goToLogin();
    expect(navegar).toHaveBeenCalledOnceWith(['/login']);
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
    component.torre = '5';
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
    component.torre = '5';
    component.password = 'password123';
    component.confirmPassword = 'password123';
    component.aceptaTerminos = true;

    await component.joinComunidad();

    expect(authServiceSpy.registerResidentAndJoinComunidad).toHaveBeenCalled();
    expect(component.joinError).toBe('El código de invitación no es válido.');
  });
});
