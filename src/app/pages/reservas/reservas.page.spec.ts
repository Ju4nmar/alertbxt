import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Reserva, Usuario, ZonaComun } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { fechaLocalISO } from '../../utils/reservas.utils';
import { ReservasPage } from './reservas.page';

const manana = new Date(Date.now() + 24 * 3600_000);
const fechaManana = fechaLocalISO(manana);

const zona: ZonaComun = { idZona: 'z1', nombre: 'Salón', comunidadId: 'c1', horaApertura: 8, horaCierre: 12, maxHoras: 2 };
const ocupada = (usuarioId: string, hora: number): Reserva => ({
  zonaId: 'z1', zonaNombre: 'Salón', comunidadId: 'c1', usuarioId, usuarioNombre: usuarioId, apartamento: '501', fecha: fechaManana, hora, inicio: '',
});

function configurar(rol: Usuario['rol']) {
  const firestore = {
    getZonasByComunidad: () => of([zona]),
    getReservasDeZonaYFecha: () => of([ocupada('otro', 9), ocupada('u1', 10)]),
    getReservasDeUsuario: () => of([]),
    getReservasDeComunidad: () => of([]),
    crearReservas: jasmine.createSpy('crearReservas').and.returnValue(of(void 0)),
    cancelarReservas: () => of(void 0),
    addZona: () => of('z2'),
    deleteZona: () => of(void 0),
  };
  TestBed.configureTestingModule({
    imports: [ReservasPage],
    providers: [
      { provide: AuthService, useValue: { currentUser$: of({ idUsuario: 'u1', nombre: 'Ana', rol, comunidadId: 'c1', torre: '10', numeroApartamento: '302', correo: '', telefono: '', activo: true } as Usuario) } },
      { provide: FirestoreService, useValue: firestore },
    ],
  });
  const fixture: ComponentFixture<ReservasPage> = TestBed.createComponent(ReservasPage);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  component.fecha = fechaManana;
  component.cambiarFecha();
  return { fixture, component, firestore };
}

describe('ReservasPage', () => {
  it('selecciona la primera zona y calcula el estado de cada bloque', () => {
    const { component } = configurar('propietario');
    expect(component.zonaId).toBe('z1');
    expect(component.bloques).toEqual([8, 9, 10, 11]);
    expect(component.estadoDe(8)).toBe('libre');
    expect(component.estadoDe(9)).toBe('ocupado');
    expect(component.estadoDe(10)).toBe('mio');
  });

  it('marca como pasado un bloque que ya empezó', () => {
    const { component } = configurar('propietario');
    component.fecha = fechaLocalISO(new Date(Date.now() - 24 * 3600_000));
    expect(component.estadoDe(8)).toBe('pasado');
  });

  it('limita la selección al máximo de horas de la zona y no deja tocar ocupados', () => {
    const { component } = configurar('propietario');
    component.tocarBloque(9);
    expect(component.seleccion).toEqual([]);
    component.tocarBloque(8);
    component.tocarBloque(11);
    expect(component.seleccion).toEqual([11]);
    component.tocarBloque(8);
    expect(component.resumenSeleccion).toContain('8:00 a. m.');
  });

  it('reserva los bloques elegidos con los datos del vecino', async () => {
    const { component, firestore } = configurar('propietario');
    component.tocarBloque(8);

    await component.reservar();

    const [lote] = firestore.crearReservas.calls.mostRecent().args;
    expect(lote.length).toBe(1);
    expect(lote[0]).toEqual(jasmine.objectContaining({
      id: `z1_${fechaManana}_8`, zonaId: 'z1', usuarioId: 'u1', torre: '10', apartamento: '302', hora: 8, fecha: fechaManana,
    }));
    expect(component.seleccion).toEqual([]);
  });

  it('no reserva sin selección', async () => {
    const { component, firestore } = configurar('propietario');
    await component.reservar();
    expect(firestore.crearReservas).not.toHaveBeenCalled();
  });

  it('valida la zona nueva antes de crearla', async () => {
    const { component } = configurar('admin');
    component.abrirFormularioZona();
    component.zonaNombre = 'Cancha';
    component.zonaApertura = 20;
    component.zonaCierre = 8;
    await component.guardarZona();
    expect(component.zonaError).toContain('apertura');
  });
});
