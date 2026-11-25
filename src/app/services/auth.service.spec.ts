import { TestBed } from '@angular/core/testing';
import { User, UserCredential } from '@angular/fire/auth';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';
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
      rolElegido: 'propietario',
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

  describe('alta con invitación', () => {
    const comunidad = { idComunidad: 'comunidad-nueva', nombreComunidad: 'El Bosque' };
    const registro = {
      nombre: ' Ana ', correo: ' ana@alertbxt.test ', telefono: ' 3000000000 ',
      numeroApartamento: ' 301 ', torre: ' 2 ', password: 'password123',
      codigoInvitacion: ' abcd1234 ', aceptaTerminos: true, rolElegido: 'arrendatario' as const,
    };

    beforeEach(() => {
      firestoreServiceSpy.getComunidadByCodigoInvitacion.and.returnValue(of(comunidad));
      firestoreServiceSpy.addUsuario.and.returnValue(of(void 0));
      authClientSpy.createUserWithEmailAndPassword.and.resolveTo(credencialDePrueba('uid-nuevo'));
      authClientSpy.signInWithGoogle.and.resolveTo({
        user: { uid: 'uid-google', email: 'ana@alertbxt.test', displayName: 'Ana' } as User,
      } as UserCredential);
    });

    it('registra al residente con datos normalizados y publica la sesión después de guardar', async () => {
      const resultado = await firstValueFrom(service.registerResidentAndJoinComunidad(registro));
      expect(firestoreServiceSpy.getComunidadByCodigoInvitacion).toHaveBeenCalledOnceWith('ABCD1234');
      expect(authClientSpy.createUserWithEmailAndPassword).toHaveBeenCalledOnceWith('ana@alertbxt.test', 'password123');
      expect(firestoreServiceSpy.addUsuario).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        idUsuario: 'uid-nuevo', nombre: 'Ana', correo: 'ana@alertbxt.test', telefono: '3000000000',
        numeroApartamento: '301', torre: '2', rol: 'arrendatario', comunidadId: 'comunidad-nueva',
      }));
      expect(resultado.comunidad).toEqual(comunidad);
      expect(service.getCurrentUser()).toEqual(resultado.usuario);
      expect(await firstValueFrom(service.authReady$)).toBeTrue();
    });

    it('rechaza el código inexistente antes de crear una cuenta', async () => {
      spyOn(console, 'error');
      firestoreServiceSpy.getComunidadByCodigoInvitacion.and.returnValue(of(null));
      await expectAsync(firstValueFrom(service.registerResidentAndJoinComunidad(registro)))
        .toBeRejectedWithError('Código de invitación inválido');
      expect(authClientSpy.createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('une al usuario autenticado y conserva su rol', async () => {
      const usuario = usuarioDePrueba({ comunidadId: '', rol: 'arrendatario' });
      service.setCurrentUser(usuario);
      const resultado = await firstValueFrom(service.joinComunidad(' abcd1234 '));
      const actualizado = { ...usuario, comunidadId: comunidad.idComunidad };
      expect(resultado.usuario).toEqual(actualizado);
      expect(firestoreServiceSpy.addUsuario).toHaveBeenCalledOnceWith(actualizado);
      expect(service.getCurrentUser()).toEqual(actualizado);
    });

    it('exige consentimiento y un código válido antes de abrir Google', async () => {
      spyOn(console, 'error');
      await expectAsync(firstValueFrom(service.joinComunidadWithGoogle('ABCD1234', false)))
        .toBeRejectedWithError('Debe aceptar el tratamiento de datos personales');
      expect(firestoreServiceSpy.getComunidadByCodigoInvitacion).not.toHaveBeenCalled();
      firestoreServiceSpy.getComunidadByCodigoInvitacion.and.returnValue(of(null));
      await expectAsync(firstValueFrom(service.joinComunidadWithGoogle('ABCD1234', true)))
        .toBeRejectedWithError('Código de invitación inválido');
      expect(authClientSpy.signInWithGoogle).not.toHaveBeenCalled();
    });

    it('crea un perfil de Google nuevo con el rol solicitado', async () => {
      firestoreServiceSpy.getUsuarioById.and.returnValue(of(null));
      const resultado = await firstValueFrom(service.joinComunidadWithGoogle(' abcd1234 ', true, 'arrendatario'));
      expect(firestoreServiceSpy.getComunidadByCodigoInvitacion).toHaveBeenCalledOnceWith('ABCD1234');
      expect(firestoreServiceSpy.addUsuario).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        idUsuario: 'uid-google', nombre: 'Ana', correo: 'ana@alertbxt.test', rol: 'arrendatario',
        telefono: '', activo: true, comunidadId: comunidad.idComunidad,
      }));
      expect(service.getCurrentUser()).toEqual(resultado.usuario);
    });

    it('conserva el perfil de Google existente y rechaza un cambio a otra vecindad', async () => {
      spyOn(console, 'error');
      const perfil = usuarioDePrueba({ comunidadId: '', rol: 'propietario' });
      firestoreServiceSpy.getUsuarioById.and.returnValue(of(perfil));
      const actualizado = { ...perfil, comunidadId: comunidad.idComunidad };
      await firstValueFrom(service.joinComunidadWithGoogle('ABCD1234', true, 'arrendatario'));
      expect(firestoreServiceSpy.addUsuario).toHaveBeenCalledOnceWith(actualizado);
      firestoreServiceSpy.getUsuarioById.and.returnValue(of({ ...perfil, comunidadId: 'otra' }));
      await expectAsync(firstValueFrom(service.joinComunidadWithGoogle('ABCD1234', true)))
        .toBeRejectedWithError('Esta cuenta de Google ya pertenece a otra vecindad');
      expect(firestoreServiceSpy.addUsuario).toHaveBeenCalledTimes(1);
      expect(service.getCurrentUser()).toEqual(actualizado);
    });
  });

  it('publica el perfil existente al ingresar con Google', async () => {
    const usuario = usuarioDePrueba();
    authClientSpy.signInWithGoogle.and.resolveTo(credencialDePrueba('uid-1'));
    firestoreServiceSpy.getUsuarioById.and.returnValue(of(usuario));
    expect(await firstValueFrom(service.loginWithGoogle())).toEqual(usuario);
    expect(service.getCurrentUser()).toEqual(usuario);
    expect(await firstValueFrom(service.authReady$)).toBeTrue();
  });

  it('registra la solicitud de eliminación en la sesión solo después de persistirla', async () => {
    await expectAsync(firstValueFrom(service.solicitarEliminacionCuenta()))
      .toBeRejectedWithError('Usuario no autenticado');
    const usuario = usuarioDePrueba();
    service.setCurrentUser(usuario);
    const escritura = new Subject<void>();
    firestoreServiceSpy.solicitarEliminacionCuenta.and.returnValue(escritura);
    const solicitud = firstValueFrom(service.solicitarEliminacionCuenta());
    const [uid, fecha] = firestoreServiceSpy.solicitarEliminacionCuenta.calls.mostRecent().args;
    expect(uid).toBe('uid-1');
    expect(new Date(fecha).toISOString()).toBe(fecha);
    expect(service.getCurrentUser()).toEqual(usuario);
    escritura.next();
    await solicitud;
    expect(service.getCurrentUser()).toEqual({
      ...usuario, pendienteEliminacion: true, fechaSolicitudEliminacion: fecha,
    });
    await expectAsync(firstValueFrom(service.solicitarEliminacionCuenta()))
      .toBeRejectedWithError('Ya existe una solicitud de eliminación para esta cuenta');
    expect(firestoreServiceSpy.solicitarEliminacionCuenta).toHaveBeenCalledTimes(1);
  });

  it('marca la sesión como resuelta y evita iniciar FCM cuando falla la carga del perfil', async () => {
    spyOn(console, 'error');
    service.setCurrentUser(usuarioDePrueba());
    firestoreServiceSpy.getUsuarioById.and.returnValue(throwError(() => new Error('offline')));
    const callback = authClientSpy.onAuthStateChanged.calls.mostRecent().args[0];
    callback({ uid: 'uid-1' } as User);
    await Promise.resolve();
    expect(service.getCurrentUser()).toBeNull();
    expect(await firstValueFrom(service.authReady$)).toBeTrue();
    expect(fcmServiceSpy.iniciarParaUsuario).not.toHaveBeenCalled();
  });

  it('conserva la sesión y reporta el fallo cuando Firebase no permite cerrar sesión', async () => {
    spyOn(console, 'error');
    const usuario = usuarioDePrueba();
    service.setCurrentUser(usuario);
    authClientSpy.signOut.and.rejectWith(new Error('offline'));
    await expectAsync(firstValueFrom(service.logout())).toBeRejectedWithError('Error al cerrar sesión');
    expect(service.getCurrentUser()).toEqual(usuario);
    expect(fcmServiceSpy.detener).not.toHaveBeenCalled();
  });
});
