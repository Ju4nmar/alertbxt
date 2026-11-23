import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular/standalone';
import { Subject, of, throwError } from 'rxjs';
import { Comunidad, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ToastService } from '../../services/toast.service';
import { PerfilUsuarioPage } from './perfil-usuario.page';

describe('PerfilUsuarioPage', () => {
  let component: PerfilUsuarioPage;
  let fixture: ComponentFixture<PerfilUsuarioPage>;
  let solicitarEliminacionSpy: jasmine.Spy;
  let confirmacion: (() => void) | undefined;
  let sesion: Subject<Usuario | null>;
  let toast: jasmine.SpyObj<ToastService>;
  const usuario: Usuario = {
    idUsuario: 'admin-1', nombre: 'Ana Pérez', correo: 'ana@alertbxt.test',
    telefono: '3000000000', rol: 'admin', activo: true, comunidadId: 'comunidad-1', torre: '3',
  };
  const comunidad: Comunidad = {
    idComunidad: 'comunidad-1', nombreComunidad: 'El Bosque', tipoComunidad: 'casas',
    codigoInvitacion: 'ABC12345', administradorNombre: usuario.nombre,
    administradorCorreo: usuario.correo, administradorCelular: usuario.telefono,
  };

  beforeEach(async () => {
    confirmacion = undefined;
    sesion = new Subject<Usuario | null>();
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    toast.success.and.resolveTo();
    toast.error.and.resolveTo();
    solicitarEliminacionSpy = jasmine.createSpy('solicitarEliminacionCuenta').and.returnValue(of(void 0));
    await TestBed.configureTestingModule({
      imports: [PerfilUsuarioPage],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUser$: sesion,
            getCurrentUser: () => null,
            setCurrentUser: () => undefined,
            solicitarEliminacionCuenta: solicitarEliminacionSpy,
          },
        },
        { provide: ToastService, useValue: toast },
        {
          provide: AlertController,
          useValue: {
            create: (opciones: { buttons: Array<{ handler?: () => void }> }) => {
              confirmacion = opciones.buttons[1].handler;
              return Promise.resolve({ present: () => Promise.resolve() });
            },
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            getComunidadById: () => of(null),
            addUsuario: () => of(void 0),
            updateComunidad: () => of(void 0),
            registrarCodigoInvitacion: () => of(void 0),
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

  it('carga el perfil, construye la invitación y la retira al perder la vecindad', () => {
    const consultar = spyOn(TestBed.inject(FirestoreService), 'getComunidadById')
      .and.returnValue(of(comunidad));
    sesion.next(usuario);
    expect(consultar).toHaveBeenCalledOnceWith('comunidad-1');
    expect(component.nombre).toBe('Ana Pérez');
    expect(component.esComunidadDeCasas).toBeTrue();
    expect(component.enlaceInvitacion).toBe(window.location.origin + '/unirse-vecindad?codigo=ABC12345');
    sesion.next({ ...usuario, comunidadId: '' });
    expect(component.comunidad).toBeNull();
    expect(component.enlaceInvitacion).toBe('');
    expect(component.nombreComunidad).toBe('');
  });

  it('valida los datos y rechaza que el administrador cambie su propio rol', async () => {
    const guardar = spyOn(TestBed.inject(FirestoreService), 'addUsuario');
    await component.guardarPerfil();
    expect(toast.error).toHaveBeenCalledWith('Completa todos los campos requeridos');
    sesion.next(usuario);
    component.nombre = 'A';
    await component.guardarPerfil();
    expect(toast.error).toHaveBeenCalledWith('Revisa la longitud de los campos');
    component.nombre = usuario.nombre;
    component.correo = 'correo-invalido';
    await component.guardarPerfil();
    expect(toast.error).toHaveBeenCalledWith('Revisa el formato del correo o del teléfono.');
    component.correo = usuario.correo;
    component.rol = 'residente';
    await component.guardarPerfil();
    expect(toast.error.calls.mostRecent().args[0]).toContain('No puedes cambiar tu propio rol');
    expect(guardar).not.toHaveBeenCalled();
  });

  it('guarda datos normalizados, conserva la torre en casas y actualiza la sesión', async () => {
    const guardar = spyOn(TestBed.inject(FirestoreService), 'addUsuario').and.callThrough();
    const actualizarSesion = spyOn(TestBed.inject(AuthService), 'setCurrentUser');
    sesion.next(usuario);
    component.comunidad = comunidad;
    component.nombre = '  Ana López  ';
    component.numeroApartamento = ' 20 ';
    component.torre = 'ignorada';
    await component.guardarPerfil();
    const actualizado = { ...usuario, nombre: 'Ana López', numeroApartamento: '20' };
    expect(guardar).toHaveBeenCalledOnceWith(actualizado);
    expect(actualizarSesion).toHaveBeenCalledOnceWith(actualizado);
    expect(component.usuario).toEqual(actualizado);
    expect(component.isSaving).toBeFalse();
  });

  it('conserva la sesión y vuelve a habilitar el guardado si falla la escritura', async () => {
    spyOn(console, 'error');
    const actualizarSesion = spyOn(TestBed.inject(AuthService), 'setCurrentUser');
    spyOn(TestBed.inject(FirestoreService), 'addUsuario').and.returnValue(throwError(() => new Error('offline')));
    sesion.next(usuario);
    await component.guardarPerfil();
    expect(actualizarSesion).not.toHaveBeenCalled();
    expect(component.usuario).toEqual(usuario);
    expect(component.isSaving).toBeFalse();
    expect(toast.error).toHaveBeenCalledOnceWith('No se pudo guardar');
  });

  it('valida el nombre de la vecindad y actualiza el nombre asociado al código', async () => {
    const db = TestBed.inject(FirestoreService);
    const actualizar = spyOn(db, 'updateComunidad').and.callThrough();
    const registrar = spyOn(db, 'registrarCodigoInvitacion').and.callThrough();
    component.comunidad = comunidad;
    component.nombreComunidad = ' ';
    await component.guardarVecindad();
    expect(toast.error).toHaveBeenCalledWith('El nombre de la vecindad es requerido');
    component.nombreComunidad = 'a'.repeat(61);
    await component.guardarVecindad();
    expect(toast.error).toHaveBeenCalledWith('No debe superar 60 caracteres');
    expect(actualizar).not.toHaveBeenCalled();

    component.nombreComunidad = '  El Nogal ';
    await component.guardarVecindad();
    expect(actualizar).toHaveBeenCalledOnceWith('comunidad-1', { nombreComunidad: 'El Nogal' });
    expect(registrar).toHaveBeenCalledOnceWith('ABC12345', 'comunidad-1', 'El Nogal');
    expect(component.comunidad.nombreComunidad).toBe('El Nogal');
    expect(component.isSavingVecindad).toBeFalse();
  });

  it('copia el código y avisa si el navegador rechaza copiar el enlace', async () => {
    spyOn(console, 'error');
    const copiar = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    component.comunidad = comunidad;
    await component.copiarCodigo();
    expect(copiar).toHaveBeenCalledOnceWith('ABC12345');
    expect(toast.success).toHaveBeenCalledOnceWith('Código copiado');
    copiar.and.rejectWith(new Error('permiso denegado'));
    component.enlaceInvitacion = '/unirse-vecindad?codigo=ABC12345';
    await component.copiarEnlace();
    expect(toast.error).toHaveBeenCalledOnceWith('No se pudo copiar');
  });

  it('permite reintentar la solicitud de eliminación cuando falla', async () => {
    spyOn(console, 'error');
    solicitarEliminacionSpy.and.returnValue(throwError(() => new Error('offline')));
    component.usuario = usuario;
    await component.solicitarEliminacionCuenta();
    confirmacion!();
    expect(component.usuario.pendienteEliminacion).toBeFalsy();
    expect(component.mensajeEliminacion).toContain('Intenta nuevamente');
    expect(component.isRequestingDeletion).toBeFalse();
  });

  it('registra la solicitud solo después de confirmar la eliminación de cuenta', async () => {
    component.usuario = {
      idUsuario: 'usuario-1',
      nombre: 'Usuario',
      correo: 'usuario@alertbxt.test',
      telefono: '3000000000',
      rol: 'residente',
      activo: true,
      comunidadId: 'comunidad-1',
    };

    await component.solicitarEliminacionCuenta();
    confirmacion?.();

    expect(solicitarEliminacionSpy).toHaveBeenCalled();
    expect(component.usuario.pendienteEliminacion).toBeTrue();
  });
});
