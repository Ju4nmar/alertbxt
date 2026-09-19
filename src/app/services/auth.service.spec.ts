import { TestBed } from '@angular/core/testing';
import { User, UserCredential } from '@angular/fire/auth';
import { firstValueFrom, of } from 'rxjs';
import { Usuario } from '../models';
import { AuthClientService } from './auth-client.service';
import { AuthService } from './auth.service';
import { FcmService } from './fcm.service';
import { FirestoreService } from './firestore.service';

function usuarioDePrueba(overrides: Partial<Usuario> = {}): Usuario {
  return {
    idUsuario: 'uid-1',
    nombre: 'Vecino de prueba',
    correo: 'vecino@alertbxt.test',
    telefono: '3000000000',
    rol: 'residente',
    activo: true,
    comunidadId: 'comunidad-1',
    ...overrides,
  };
}

function credencialDePrueba(uid: string): UserCredential {
  return { user: { uid } as User } as UserCredential;
}

describe('AuthService', () => {
  let service: AuthService;
  let authClientSpy: jasmine.SpyObj<AuthClientService>;
  let firestoreServiceSpy: jasmine.SpyObj<Pick<FirestoreService,
    'getUsuarioById' | 'addUsuario' | 'addComunidad' | 'getComunidadByCodigoInvitacion' | 'registrarCodigoInvitacion' | 'solicitarEliminacionCuenta'>>;
  let fcmServiceSpy: jasmine.SpyObj<FcmService>;

  beforeEach(() => {
    authClientSpy = jasmine.createSpyObj('AuthClientService', [
      'onAuthStateChanged',
      'signInWithEmailAndPassword',
      'signInWithGoogle',
      'createUserWithEmailAndPassword',
      'signOut',
    ]);
    authClientSpy.onAuthStateChanged.and.returnValue(() => undefined);
    authClientSpy.signOut.and.resolveTo();

    firestoreServiceSpy = jasmine.createSpyObj('FirestoreService', [
      'getUsuarioById', 'addUsuario', 'addComunidad', 'getComunidadByCodigoInvitacion', 'registrarCodigoInvitacion', 'solicitarEliminacionCuenta',
    ]);

    fcmServiceSpy = jasmine.createSpyObj('FcmService', ['iniciarParaUsuario', 'detener']);
    fcmServiceSpy.iniciarParaUsuario.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthClientService, useValue: authClientSpy },
        { provide: FirestoreService, useValue: firestoreServiceSpy },
        { provide: FcmService, useValue: fcmServiceSpy },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('login() actualiza el usuario actual cuando las credenciales y el perfil son válidos', async () => {
    const usuario = usuarioDePrueba();
    authClientSpy.signInWithEmailAndPassword.and.resolveTo(credencialDePrueba('uid-1'));
    firestoreServiceSpy.getUsuarioById.and.returnValue(of(usuario));

    const resultado = await firstValueFrom(service.login('vecino@alertbxt.test', 'password123'));

    expect(resultado).toEqual(usuario);
    expect(service.getCurrentUser()).toEqual(usuario);
    expect(authClientSpy.signOut).not.toHaveBeenCalled();
  });

  it('login() cierra la sesión y rechaza con "cuenta-desactivada" cuando el usuario está inactivo', async () => {
    const usuarioInactivo = usuarioDePrueba({ activo: false });
    authClientSpy.signInWithEmailAndPassword.and.resolveTo(credencialDePrueba('uid-1'));
    firestoreServiceSpy.getUsuarioById.and.returnValue(of(usuarioInactivo));

    await expectAsync(firstValueFrom(service.login('vecino@alertbxt.test', 'password123')))
      .toBeRejectedWithError('cuenta-desactivada');

    expect(authClientSpy.signOut).toHaveBeenCalledTimes(1);
    expect(service.getCurrentUser()).toBeNull();
  });

  it('login() propaga el error de "cuenta-desactivada" aunque signOut() falle de forma transitoria', async () => {
    // Reproduce el bug histórico: signOut() lanzando
    // auth/the-service-is-currently-unavailable no debe enmascarar el error
    // real que queremos mostrarle al usuario.
    const usuarioInactivo = usuarioDePrueba({ activo: false });
    authClientSpy.signInWithEmailAndPassword.and.resolveTo(credencialDePrueba('uid-1'));
    firestoreServiceSpy.getUsuarioById.and.returnValue(of(usuarioInactivo));
    authClientSpy.signOut.and.rejectWith(new Error('auth/the-service-is-currently-unavailable'));

    await expectAsync(firstValueFrom(service.login('vecino@alertbxt.test', 'password123')))
      .toBeRejectedWithError('cuenta-desactivada');
  });

  it('login() cierra la sesión y rechaza cuando no existe perfil en Firestore para el uid autenticado', async () => {
    authClientSpy.signInWithEmailAndPassword.and.resolveTo(credencialDePrueba('uid-huerfano'));
    firestoreServiceSpy.getUsuarioById.and.returnValue(of(null));

    await expectAsync(firstValueFrom(service.login('vecino@alertbxt.test', 'password123')))
      .toBeRejectedWithError('Usuario no encontrado en la base de datos');

    expect(authClientSpy.signOut).toHaveBeenCalledTimes(1);
  });

  it('loginWithGoogle() cierra la sesión y rechaza con "cuenta-desactivada" cuando el usuario está inactivo', async () => {
    const usuarioInactivo = usuarioDePrueba({ activo: false });
    authClientSpy.signInWithGoogle.and.resolveTo(credencialDePrueba('uid-1'));
    firestoreServiceSpy.getUsuarioById.and.returnValue(of(usuarioInactivo));

    await expectAsync(firstValueFrom(service.loginWithGoogle()))
      .toBeRejectedWithError('cuenta-desactivada');

    expect(authClientSpy.signOut).toHaveBeenCalledTimes(1);
  });

  it('loginWithGoogle() cierra la sesión y rechaza cuando la cuenta de Google no tiene perfil registrado', async () => {
    authClientSpy.signInWithGoogle.and.resolveTo(credencialDePrueba('uid-google'));
    firestoreServiceSpy.getUsuarioById.and.returnValue(of(null));

    await expectAsync(firstValueFrom(service.loginWithGoogle()))
      .toBeRejectedWithError('No existe una cuenta con este usuario de Google. Regístrate o únete con un código de invitación.');
  });

  it('logout() limpia el usuario actual y detiene FCM', async () => {
    service.setCurrentUser(usuarioDePrueba());

    await firstValueFrom(service.logout());

    expect(service.getCurrentUser()).toBeNull();
    expect(fcmServiceSpy.detener).toHaveBeenCalledTimes(1);
  });

  it('joinComunidad() rechaza con un código de invitación inválido sin tocar el usuario actual', async () => {
    service.setCurrentUser(usuarioDePrueba());
    firestoreServiceSpy.getComunidadByCodigoInvitacion.and.returnValue(of(null));

    await expectAsync(firstValueFrom(service.joinComunidad('XXXXXXXX')))
      .toBeRejectedWithError('Código de invitación inválido');

    expect(firestoreServiceSpy.addUsuario).not.toHaveBeenCalled();
  });

  it('joinComunidad() rechaza cuando el usuario ya pertenece a otra vecindad', async () => {
    service.setCurrentUser(usuarioDePrueba({ comunidadId: 'comunidad-actual' }));
    firestoreServiceSpy.getComunidadByCodigoInvitacion.and.returnValue(
      of({ idComunidad: 'comunidad-otra', nombreComunidad: 'Otra' })
    );

    await expectAsync(firstValueFrom(service.joinComunidad('ABCD1234')))
      .toBeRejectedWithError('El usuario ya pertenece a otra vecindad');

    expect(firestoreServiceSpy.addUsuario).not.toHaveBeenCalled();
  });

  it('registerResidentAndJoinComunidad() exige aceptar el tratamiento de datos antes de crear la cuenta', async () => {
    await expectAsync(firstValueFrom(service.registerResidentAndJoinComunidad({
      nombre: 'Vecino',
      correo: 'vecino@alertbxt.test',
      telefono: '3000000000',
      numeroApartamento: '101',
      password: 'password123',
      codigoInvitacion: 'ABCD1234',
      aceptaTerminos: false,
    }))).toBeRejectedWithError('Debe aceptar el tratamiento de datos personales');

    expect(authClientSpy.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('registerAdminAndCreateComunidad() exige aceptar el tratamiento de datos antes de crear la cuenta', async () => {
    await expectAsync(firstValueFrom(service.registerAdminAndCreateComunidad({
      nombreComunidad: 'Cañadulce',
      administradorNombre: 'Admin',
      administradorCorreo: 'admin@alertbxt.test',
      administradorCelular: '3000000000',
      contrasena: 'password123',
      tipoComunidad: 'apartamentos',
      aceptaTerminos: false,
    }))).toBeRejectedWithError('Debe aceptar el tratamiento de datos personales');

    expect(authClientSpy.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('registerAdminAndCreateComunidad() crea la comunidad y registra su código de invitación', async () => {
    // El cliente escribe codigos_invitacion como respaldo de la Cloud
    // Function onComunidadWrite (ver comentario en
    // FirestoreService.registrarCodigoInvitacion), así que debe llamarse
    // con el mismo código generado para la comunidad.
    firestoreServiceSpy.addComunidad.and.returnValue(of('comunidad-nueva'));
    firestoreServiceSpy.registrarCodigoInvitacion.and.returnValue(of(void 0));
    firestoreServiceSpy.addUsuario.and.returnValue(of(void 0));
    authClientSpy.createUserWithEmailAndPassword.and.resolveTo(credencialDePrueba('uid-admin'));

    await firstValueFrom(service.registerAdminAndCreateComunidad({
      nombreComunidad: 'Cañadulce',
      administradorNombre: 'Admin',
      administradorCorreo: 'admin@alertbxt.test',
      administradorCelular: '3000000000',
      contrasena: 'password123',
      tipoComunidad: 'apartamentos',
      aceptaTerminos: true,
    }));

    expect(firestoreServiceSpy.addComunidad).toHaveBeenCalledWith(jasmine.objectContaining({
      nombreComunidad: 'Cañadulce',
      codigoInvitacion: jasmine.stringMatching(/^[A-Z0-9]{8}$/),
      tipoComunidad: 'apartamentos',
    }));
    expect(firestoreServiceSpy.registrarCodigoInvitacion).toHaveBeenCalledWith(
      jasmine.stringMatching(/^[A-Z0-9]{8}$/),
      'comunidad-nueva',
      'Cañadulce',
      'apartamentos'
    );
  });

  it('setupAuthState() carga el perfil de Firestore cuando Firebase Auth reporta un usuario autenticado', async () => {
    const usuario = usuarioDePrueba();
    firestoreServiceSpy.getUsuarioById.and.returnValue(of(usuario));
    const callback = authClientSpy.onAuthStateChanged.calls.mostRecent().args[0];

    await callback({ uid: 'uid-1' } as User);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(service.getCurrentUser()).toEqual(usuario);
    expect(fcmServiceSpy.iniciarParaUsuario).toHaveBeenCalledWith(usuario);
  });

  it('setupAuthState() limpia el usuario actual cuando Firebase Auth reporta que no hay sesión', async () => {
    service.setCurrentUser(usuarioDePrueba());
    const callback = authClientSpy.onAuthStateChanged.calls.mostRecent().args[0];

    await callback(null);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(service.getCurrentUser()).toBeNull();
  });
});
