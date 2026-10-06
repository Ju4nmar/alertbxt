import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RestablecerContrasenaPage } from './restablecer-contrasena.page';

// Las funciones de @angular/fire/auth son exports de módulo ES (no
// sobrescribibles): aquí solo se cubre lo que no depende de la red.
describe('RestablecerContrasenaPage', () => {
  let fixture: ComponentFixture<RestablecerContrasenaPage>;
  let component: RestablecerContrasenaPage;

  async function crear(oobCode: string | null) {
    await TestBed.configureTestingModule({
      imports: [RestablecerContrasenaPage],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: {} },
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
  });
});
