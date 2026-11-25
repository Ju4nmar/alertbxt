import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Subject, throwError } from 'rxjs';
import { Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { RegistroPage } from './registro.page';

class MockAuthService {
  registerAdminAndCreateComunidad = jasmine.createSpy<AuthService['registerAdminAndCreateComunidad']>();
}
class MockRouter {
  navigate = jasmine.createSpy('navigate');
}

describe('RegistroPage', () => {
  let component: RegistroPage;
  let fixture: ComponentFixture<RegistroPage>;
  let auth: jasmine.SpyObj<AuthService>;
  let navegar: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistroPage, FormsModule, IonicModule],
      providers: [
        { provide: AuthService, useClass: MockAuthService },
        { provide: Router, useClass: MockRouter }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RegistroPage);
    component = fixture.componentInstance;
    auth = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    navegar = TestBed.inject(Router).navigate as jasmine.Spy;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function llenarFormulario(): void {
    Object.assign(component, {
      nombreComunidad: ' El Bosque ', administradorNombre: ' Ana Pérez ',
      administradorCorreo: ' ana@alertbxt.test ', administradorCelular: ' 3000000000 ',
      password: 'password123', confirmPassword: 'password123', aceptaTerminos: true,
    });
    component.elegirTipoComunidad('casas');
  }

  for (const [campos, mensaje] of [
    [{ administradorNombre: '' }, 'Completa todos los campos requeridos.'],
    [{ tipoComunidad: '' }, 'Selecciona si tu vecindad es de apartamentos o de casas.'],
    [{ nombreComunidad: 'A' }, 'Revisa la longitud de los campos del formulario.'],
    [{ administradorCorreo: 'incorrecto' }, 'Revisa el formato del correo o del celular.'],
    [{ confirmPassword: 'otraPassword' }, 'Las contraseñas no coinciden.'],
    [{ aceptaTerminos: false }, 'Debes aceptar el tratamiento de tus datos personales.'],
  ] as const) {
    it(`valida el registro: ${mensaje}`, async () => {
      llenarFormulario();
      Object.assign(component, campos);
      await component.createComunidad();
      expect(component.registroError).toBe(mensaje);
      expect(auth.registerAdminAndCreateComunidad).not.toHaveBeenCalled();
    });
  }

  it('crea una vecindad de casas una sola vez y abre el inicio', async () => {
    llenarFormulario();
    const administrador: Usuario = {
      idUsuario: 'admin-1', nombre: 'Ana Pérez', correo: 'ana@alertbxt.test',
      telefono: '3000000000', rol: 'admin', activo: true, comunidadId: 'comunidad-1',
    };
    const comunidad = {
      idComunidad: 'comunidad-1', nombreComunidad: 'El Bosque', codigoInvitacion: 'ABC12345',
      administradorNombre: administrador.nombre, administradorCorreo: administrador.correo,
      administradorCelular: administrador.telefono,
    };
    const alta = new Subject<{ comunidad: typeof comunidad; usuario: Usuario }>();
    auth.registerAdminAndCreateComunidad.and.returnValue(alta);
    const crear = component.createComunidad();
    await component.createComunidad();
    expect(component.isLoading).toBeTrue();
    expect(auth.registerAdminAndCreateComunidad).toHaveBeenCalledOnceWith({
      nombreComunidad: 'El Bosque', administradorNombre: administrador.nombre,
      administradorCorreo: administrador.correo, administradorCelular: administrador.telefono,
      contrasena: 'password123', tipoComunidad: 'casas', aceptaTerminos: true,
    });
    alta.next({ comunidad, usuario: administrador });
    await crear;
    expect(navegar).toHaveBeenCalledOnceWith(['/inicio']);
    expect(component.isLoading).toBeFalse();
  });

  for (const [code, mensaje] of [
    ['auth/email-already-in-use', 'Este correo ya está registrado.'],
    ['auth/invalid-email', 'El correo no tiene un formato válido.'],
    ['auth/weak-password', 'La contraseña es demasiado débil.'],
    ['auth/network-request-failed', 'No se pudo crear la vecindad. Intenta nuevamente.'],
  ]) {
    it(`traduce el error ${code} y conserva el formulario para reintentar`, async () => {
      spyOn(console, 'error');
      llenarFormulario();
      auth.registerAdminAndCreateComunidad.and.returnValue(throwError(() => ({ code })));
      await component.createComunidad();
      expect(component.registroError).toBe(mensaje);
      expect(component.isLoading).toBeFalse();
      expect(component.tipoComunidad).toBe('casas');
      expect(navegar).not.toHaveBeenCalled();
    });
  }
});
