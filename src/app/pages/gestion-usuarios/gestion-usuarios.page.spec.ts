import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular/standalone';
import { of } from 'rxjs';
import { Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { GestionUsuariosPage } from './gestion-usuarios.page';

describe('GestionUsuariosPage', () => {
  let component: GestionUsuariosPage;
  let fixture: ComponentFixture<GestionUsuariosPage>;
  let updateUsuarioEstadoSpy: jasmine.Spy;
  let alertControllerSpy: jasmine.SpyObj<Pick<AlertController, 'create'>>;

  const admin: Usuario = {
    idUsuario: 'admin-1',
    nombre: 'Admin',
    correo: 'admin@alertbxt.test',
    telefono: '3000000000',
    rol: 'admin',
    activo: true,
    comunidadId: 'comunidad-1',
  };

  const residente: Usuario = {
    idUsuario: 'residente-1',
    nombre: 'Residente',
    correo: 'residente@alertbxt.test',
    telefono: '3000000001',
    rol: 'residente',
    activo: true,
    comunidadId: 'comunidad-1',
  };

  beforeEach(async () => {
    updateUsuarioEstadoSpy = jasmine.createSpy('updateUsuarioEstado').and.returnValue(of(void 0));
    alertControllerSpy = jasmine.createSpyObj('AlertController', ['create']);

    await TestBed.configureTestingModule({
      imports: [GestionUsuariosPage],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUser$: of(admin),
            getCurrentUser: () => admin,
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            getUsuariosByComunidad: () => of([residente]),
            getComunidadById: () => of(null),
            updateUsuarioEstado: updateUsuarioEstadoSpy,
          },
        },
        { provide: AlertController, useValue: alertControllerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GestionUsuariosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('un administrador puede reactivar a un residente inactivo directamente', () => {
    const residenteInactivo = { ...residente, activo: false };

    component.alternarEstado(residenteInactivo);

    expect(updateUsuarioEstadoSpy).toHaveBeenCalledWith('residente-1', { activo: true });
    expect(alertControllerSpy.create).not.toHaveBeenCalled();
  });

  it('desactivar un residente activo pide confirmación antes de actualizar', async () => {
    let manejadorDesactivar: (() => void) | undefined;
    alertControllerSpy.create.and.callFake((opciones: unknown) => {
      const config = opciones as { buttons: Array<{ role?: string; handler?: () => void }> };
      manejadorDesactivar = config.buttons.find(boton => boton.role === 'destructive')?.handler;
      return Promise.resolve({ present: () => Promise.resolve() } as never);
    });

    await component.alternarEstado(residente);

    expect(alertControllerSpy.create).toHaveBeenCalled();
    expect(updateUsuarioEstadoSpy).not.toHaveBeenCalled();

    manejadorDesactivar?.();

    expect(updateUsuarioEstadoSpy).toHaveBeenCalledWith('residente-1', { activo: false });
  });

  it('un administrador no puede gestionar su propia cuenta', () => {
    expect(component.puedeGestionarUsuario(admin)).toBeFalse();
  });

  it('cambiarRol invierte el rol de un residente gestionable', () => {
    component.cambiarRol(residente);

    expect(updateUsuarioEstadoSpy).toHaveBeenCalledWith('residente-1', { rol: 'admin' });
  });
});
