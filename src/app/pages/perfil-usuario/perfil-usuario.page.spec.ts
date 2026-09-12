import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular/standalone';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { PerfilUsuarioPage } from './perfil-usuario.page';

describe('PerfilUsuarioPage', () => {
  let component: PerfilUsuarioPage;
  let fixture: ComponentFixture<PerfilUsuarioPage>;
  let solicitarEliminacionSpy: jasmine.Spy;
  let confirmacion: (() => void) | undefined;

  beforeEach(async () => {
    solicitarEliminacionSpy = jasmine.createSpy('solicitarEliminacionCuenta').and.returnValue(of(void 0));
    await TestBed.configureTestingModule({
      imports: [PerfilUsuarioPage],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUser$: of(null),
            getCurrentUser: () => null,
            setCurrentUser: () => undefined,
            solicitarEliminacionCuenta: solicitarEliminacionSpy,
          },
        },
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
