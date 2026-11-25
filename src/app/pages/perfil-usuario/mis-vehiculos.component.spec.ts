import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { Usuario, Vehiculo } from '../../models';
import { FirestoreService } from '../../services/firestore.service';
import { MisVehiculosComponent } from './mis-vehiculos.component';

describe('MisVehiculosComponent', () => {
  const vecino: Usuario = {
    idUsuario: 'vecino-1', nombre: 'Ana', correo: 'ana@alertbxt.test',
    telefono: '3000000000', rol: 'propietario', activo: true, comunidadId: 'comunidad-1',
    torre: '3', numeroApartamento: '502',
  };
  const vehiculo: Vehiculo = {
    idVehiculo: 'vehiculo-1', placa: 'ABC123', tipo: 'moto', propietarioId: 'vecino-1',
    propietarioNombre: 'Ana', comunidadId: 'comunidad-1', fechaRegistro: '2026-01-01T00:00:00Z',
  };
  let db: jasmine.SpyObj<FirestoreService>;
  let fixture: ComponentFixture<MisVehiculosComponent>;
  let component: MisVehiculosComponent;

  beforeEach(() => {
    db = jasmine.createSpyObj<FirestoreService>('FirestoreService', [
      'getVehiculosDeUsuario', 'addVehiculo', 'deleteVehiculo',
    ]);
    db.getVehiculosDeUsuario.and.returnValue(of([vehiculo]));
    db.addVehiculo.and.returnValue(of('vehiculo-1'));
    db.deleteVehiculo.and.returnValue(of(void 0));
    TestBed.configureTestingModule({
      imports: [MisVehiculosComponent],
      providers: [{ provide: FirestoreService, useValue: db }],
    });
    fixture = TestBed.createComponent(MisVehiculosComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('usuario', vecino);
  });

  it('actualiza la lista y deja de escuchar al vecino anterior cuando cambia el perfil', () => {
    const listaAnterior = new Subject<Vehiculo[]>();
    db.getVehiculosDeUsuario.withArgs('vecino-1', 'comunidad-1').and.returnValue(listaAnterior);
    fixture.detectChanges();
    expect(component.cargando).toBeTrue();
    listaAnterior.next([vehiculo]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.vehiculo-datos').textContent).toContain('Moto');
    expect(component.cargando).toBeFalse();
    db.getVehiculosDeUsuario.withArgs('vecino-2', 'comunidad-1').and.returnValue(of([]));
    fixture.componentRef.setInput('usuario', { ...vecino, idUsuario: 'vecino-2' });
    fixture.detectChanges();
    expect(listaAnterior.observed).toBeFalse();
    expect(component.vehiculos).toEqual([]);
  });

  it('informa un fallo al cargar los vehículos', () => {
    db.getVehiculosDeUsuario.and.returnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    expect(component.cargando).toBeFalse();
    expect(component.error).toContain('No se pudieron cargar');
  });

  it('valida la placa y guarda una sola vez el vehículo normalizado', async () => {
    fixture.detectChanges();
    component.placa = '123';
    await component.agregar();
    expect(component.error).toContain('placa válida');
    expect(db.addVehiculo).not.toHaveBeenCalled();

    const escritura = new Subject<string>();
    db.addVehiculo.and.returnValue(escritura);
    Object.assign(component, { placa: ' abc-123 ', tipo: 'moto', marca: ' Honda ', color: ' ' });
    const guardado = component.agregar();
    await component.agregar();
    expect(component.guardando).toBeTrue();
    expect(db.addVehiculo).toHaveBeenCalledOnceWith({
      placa: 'ABC123', tipo: 'moto', marca: 'Honda', color: undefined,
      propietarioId: 'vecino-1', propietarioNombre: 'Ana', torre: '3', apartamento: '502',
      comunidadId: 'comunidad-1',
    });
    escritura.next('vehiculo-1');
    await guardado;
    expect(component.placa).toBe('');
    expect(component.tipo).toBe('carro');
    expect(component.guardando).toBeFalse();
  });

  it('conserva la placa y avisa si ya está registrada', async () => {
    fixture.detectChanges();
    db.addVehiculo.and.returnValue(throwError(() => ({ code: 'permission-denied' })));
    component.placa = 'ABC123';
    await component.agregar();
    expect(component.error).toContain('ya está registrada');
    expect(component.placa).toBe('ABC123');
    expect(component.guardando).toBeFalse();
  });

  it('borra solo vehículos con identificador e informa un fallo de eliminación', async () => {
    fixture.detectChanges();
    await component.quitar({ ...vehiculo, idVehiculo: undefined });
    expect(db.deleteVehiculo).not.toHaveBeenCalled();
    db.deleteVehiculo.and.returnValue(throwError(() => new Error('offline')));
    await component.quitar(vehiculo);
    expect(db.deleteVehiculo).toHaveBeenCalledOnceWith('vehiculo-1');
    expect(component.error).toBe('No se pudo eliminar el vehículo.');
  });
});
