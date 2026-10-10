import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Usuario, Vehiculo } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { VehiculosPage } from './vehiculos.page';

const base = { propietarioId: 'u', comunidadId: 'c1', fechaRegistro: '', tipo: 'carro' as const };
const vehiculos: Vehiculo[] = [
  { ...base, idVehiculo: 'c1_ABC123', placa: 'ABC123', propietarioNombre: 'Ana Ruiz', torre: '10', apartamento: '302' },
  { ...base, idVehiculo: 'c1_XYZ98K', placa: 'XYZ98K', tipo: 'moto', propietarioNombre: 'Luis Mora', apartamento: '5' },
];

describe('VehiculosPage', () => {
  let fixture: ComponentFixture<VehiculosPage>;
  let component: VehiculosPage;
  let consulta: jasmine.Spy;

  beforeEach(async () => {
    consulta = jasmine.createSpy('getVehiculosDeComunidad').and.returnValue(of(vehiculos));
    await TestBed.configureTestingModule({
      imports: [VehiculosPage],
      providers: [
        { provide: AuthService, useValue: { currentUser$: of({ idUsuario: 'g', rol: 'guarda', comunidadId: 'c1' } as Usuario) } },
        { provide: FirestoreService, useValue: { getVehiculosDeComunidad: consulta } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(VehiculosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('carga los vehículos de la comunidad del usuario', () => {
    expect(consulta).toHaveBeenCalledWith('c1');
    expect(component.resultados.length).toBe(2);
  });

  it('busca por placa ignorando espacios, guiones y mayúsculas', () => {
    component.busqueda = 'abc-12';
    expect(component.resultados.map(v => v.placa)).toEqual(['ABC123']);
  });

  it('busca por dueño o por torre/apartamento', () => {
    component.busqueda = 'mora';
    expect(component.resultados.map(v => v.placa)).toEqual(['XYZ98K']);
    component.busqueda = '302';
    expect(component.resultados.map(v => v.placa)).toEqual(['ABC123']);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    component.busqueda = 'zzzzzz';
    expect(component.resultados).toEqual([]);
  });
});
