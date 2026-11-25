import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { deleteApp, FirebaseApp, initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence } from 'firebase/auth';
import { RestablecerContrasenaPage } from './restablecer-contrasena.page';

describe('RestablecerContrasenaPage', () => {
  let fixture: ComponentFixture<RestablecerContrasenaPage>;
  let component: RestablecerContrasenaPage;
  let app: FirebaseApp;
  let fetchSpy: jasmine.Spy<typeof fetch>;
  const correo = 'vecina@alertbxt.test';
  const codigo = 'codigo-de-prueba';

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch');
    app = initializeApp({ apiKey: 'clave-de-prueba', projectId: 'demo-alertbxt-auth' }, 'alertbxt-reset-spec');
  });

  afterEach(() => deleteApp(app));

  function respuesta(datos: object, status = 200): Response {
    return new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });
  }

  function solicitudes(): object[] {
    return fetchSpy.calls.allArgs().map(([url, opciones]) => {
      expect(String(url)).toContain('/v1/accounts:resetPassword');
      expect(opciones?.method).toBe('POST');
      return JSON.parse(opciones?.body as string);
    });
  }

  async function crear(oobCode: string | null) {
    await TestBed.configureTestingModule({
      imports: [RestablecerContrasenaPage],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: initializeAuth(app, { persistence: inMemoryPersistence }) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(oobCode ? { oobCode } : {}) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RestablecerContrasenaPage);
    component = fixture.componentInstance;
  }

  it('sin código en el enlace muestra "enlace no válido"', async () => {
    await crear(null);
    await component.ngOnInit();
    expect(component.estado).toBe('invalido');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exige 8 caracteres y que las contraseñas coincidan para guardar', async () => {
    await crear('abc');
    component.password = 'corta';
    component.confirmPassword = 'corta';
    expect(component.puedeGuardar).toBeFalse();

    component.password = 'clave-larga-1';
    component.confirmPassword = 'otra-distinta';
    expect(component.puedeGuardar).toBeFalse();

    component.confirmPassword = 'clave-larga-1';
    expect(component.puedeGuardar).toBeTrue();

    component.password = component.confirmPassword = 'a'.repeat(41);
    await component.guardar();
    expect(component.puedeGuardar).toBeFalse();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('verifica el enlace, impide envíos simultáneos y confirma la nueva contraseña', async () => {
    let confirmar!: (value: Response) => void;
    fetchSpy.and.returnValues(Promise.resolve(respuesta({ email: correo, requestType: 'PASSWORD_RESET' })),
      new Promise<Response>(resolve => confirmar = resolve));
    await crear(codigo);
    const validar = component.ngOnInit();
    expect(component.estado).toBe('verificando');
    await validar;
    expect(component.estado).toBe('listo');
    expect(component.correo).toBe(correo);

    component.password = component.confirmPassword = 'clave-larga-1';
    const guardar = component.guardar();
    expect(component.isLoading).toBeTrue();
    await component.guardar();
    confirmar(respuesta({ email: correo }));
    await guardar;
    expect(solicitudes()).toEqual([{ oobCode: codigo }, { oobCode: codigo, newPassword: 'clave-larga-1' }]);
    expect(component.estado).toBe('exito');
    expect(component.isLoading).toBeFalse();
  });

  it('rechaza un código vencido al verificar el enlace y permite pedir otro', async () => {
    spyOn(console, 'warn');
    fetchSpy.and.resolveTo(respuesta({ error: { message: 'EXPIRED_OOB_CODE' } }, 400));
    await crear(codigo);
    await component.ngOnInit();
    expect(component.estado).toBe('invalido');
    expect(component.correo).toBe('');
    const navegar = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    component.pedirOtroEnlace();
    component.irALogin();
    expect(navegar.calls.allArgs()).toEqual([[['/forgot-password']], [['/login']]]);
  });

  for (const [motivo, estado, mensaje] of [
    ['INVALID_OOB_CODE', 'invalido', ''],
    ['WEAK_PASSWORD', 'listo', 'La contraseña es muy débil. Usa al menos 8 caracteres.'],
    ['INTERNAL_ERROR', 'listo', 'No se pudo cambiar la contraseña. Intenta nuevamente.'],
  ] as const) {
    it(`gestiona ${motivo} al confirmar y libera el formulario`, async () => {
      spyOn(console, 'error');
      fetchSpy.and.returnValues(Promise.resolve(respuesta({ email: correo, requestType: 'PASSWORD_RESET' })),
        Promise.resolve(respuesta({ error: { message: motivo } }, 400)));
      await crear(codigo);
      await component.ngOnInit();
      component.password = component.confirmPassword = 'clave-larga-1';
      await component.guardar();
      expect(component.estado).toBe(estado);
      expect(component.error).toBe(mensaje);
      expect(component.isLoading).toBeFalse();
      expect(solicitudes().length).toBe(2);
    });
  }
});
