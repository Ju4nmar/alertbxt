import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Encuesta, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { EncuestasPage } from './encuestas.page';

const hora = 3600_000;
const encuesta = (id: string, cierre: number, extra: Partial<Encuesta> = {}): Encuesta => ({
  idEncuesta: id, titulo: id, opciones: ['Sí', 'No'], comunidadId: 'c1', autorId: 'a',
  soloPropietarios: false, cierre: new Date(Date.now() + cierre).toISOString(), conteo: {}, totalVotos: 0, ...extra,
});

function configurar(rol: Usuario['rol'], votos: Record<string, number | null> = {}) {
  const firestore = {
    getEncuestasByComunidad: jasmine.createSpy('getEncuestasByComunidad').and.returnValue(of([
      encuesta('abierta', 24 * hora),
      encuesta('cerrada', -hora, { conteo: { '0': 3, '1': 1 }, totalVotos: 4 }),
    ])),
    getMiVoto: (id: string) => of(votos[id] ?? null),
    votarEncuesta: jasmine.createSpy('votarEncuesta').and.returnValue(of(void 0)),
    addEncuesta: jasmine.createSpy('addEncuesta').and.returnValue(of('nueva')),
    cerrarEncuesta: () => of(void 0),
    deleteEncuesta: () => of(void 0),
  };
  TestBed.configureTestingModule({
    imports: [EncuestasPage],
    providers: [
      { provide: AuthService, useValue: { currentUser$: of({ idUsuario: 'u1', nombre: 'Ana', rol, comunidadId: 'c1', correo: '', telefono: '', activo: true } as Usuario) } },
      { provide: FirestoreService, useValue: firestore },
    ],
  });
  const fixture: ComponentFixture<EncuestasPage> = TestBed.createComponent(EncuestasPage);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, firestore };
}

describe('EncuestasPage', () => {
  it('pide las encuestas con el rol del usuario', () => {
    const { firestore } = configurar('arrendatario');
    expect(firestore.getEncuestasByComunidad).toHaveBeenCalledWith('c1', 'arrendatario');
  });

  it('un vecino puede votar solo en encuestas abiertas donde no ha votado', () => {
    const { component, firestore } = configurar('propietario', { cerrada: 0 });
    const [abierta, cerrada] = component.encuestas;
    expect(component.puedeVotar(abierta)).toBeTrue();
    expect(component.puedeVotar(cerrada)).toBeFalse();
    expect(component.mostrarResultados(abierta)).toBeFalse();
    expect(component.mostrarResultados(cerrada)).toBeTrue();
    expect(firestore.votarEncuesta).not.toHaveBeenCalled();
  });

  it('registra el voto elegido y pasa a mostrar resultados', async () => {
    const { component, firestore } = configurar('propietario');
    const abierta = component.encuestas[0];
    component.elegir(abierta, 1);

    await component.votar(abierta);

    expect(firestore.votarEncuesta).toHaveBeenCalledWith('abierta', 'u1', 1);
    expect(component.yaVoto(abierta)).toBeTrue();
    expect(component.mostrarResultados(abierta)).toBeTrue();
  });

  it('no vota sin haber elegido una opción', async () => {
    const { component, firestore } = configurar('propietario');
    await component.votar(component.encuestas[0]);
    expect(firestore.votarEncuesta).not.toHaveBeenCalled();
  });

  it('calcula porcentajes y evita dividir entre cero', () => {
    const { component } = configurar('propietario');
    const [abierta, cerrada] = component.encuestas;
    expect(component.porcentaje(cerrada, 0)).toBe(75);
    expect(component.porcentaje(cerrada, 1)).toBe(25);
    expect(component.porcentaje(abierta, 0)).toBe(0);
  });

  it('el admin ve resultados siempre y valida el formulario antes de publicar', async () => {
    const { component, firestore } = configurar('admin');
    expect(component.mostrarResultados(component.encuestas[0])).toBeTrue();

    component.abrirFormulario();
    component.titulo = 'Pregunta válida';
    component.opciones = ['Sí', 'sí'];
    await component.publicar();
    expect(component.formError).toContain('dos opciones distintas');
    expect(firestore.addEncuesta).not.toHaveBeenCalled();

    component.opciones = ['Sí', 'No'];
    await component.publicar();
    expect(firestore.addEncuesta).toHaveBeenCalledWith(jasmine.objectContaining({
      titulo: 'Pregunta válida', opciones: ['Sí', 'No'], soloPropietarios: false, comunidadId: 'c1',
    }));
    expect(component.formAbierto).toBeFalse();
  });
});
