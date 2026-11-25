import { TestBed } from '@angular/core/testing';
import Shepherd from 'shepherd.js';
import { Usuario } from '../models';
import { TourService } from './tour.service';

describe('TourService', () => {
  const uid = 'usuario-tour-test';
  const vecino: Usuario = {
    idUsuario: uid, nombre: 'Ana', correo: 'ana@alertbxt.test', telefono: '3000000000',
    rol: 'propietario', activo: true, comunidadId: 'comunidad-1',
  };
  let navegacion: HTMLElement;

  afterEach(() => {
    localStorage.removeItem(`ab_tour_visto_${uid}`);
    navegacion?.remove();
  });

  function mostrarNavegacion(): void {
    navegacion = document.createElement('nav');
    document.body.append(navegacion);
    for (const [id, posicion] of [
      ['inicio', new DOMRect(10, 10, 80, 20)],
      ['avisos', new DOMRect(340, 10, 80, 20)],
      ['vehiculos', new DOMRect(10, window.innerHeight * 0.8, 80, 20)],
      ['mensajes', new DOMRect()],
    ] as const) {
      const boton = document.createElement('button');
      boton.dataset['tour'] = id;
      spyOn(boton, 'getBoundingClientRect').and.returnValue(posicion);
      navegacion.append(boton);
    }
  }

  it('recuerda por usuario que el recorrido ya se vio', () => {
    const service = TestBed.inject(TourService);
    expect(service.yaVisto(uid)).toBeFalse();

    localStorage.setItem(`ab_tour_visto_${uid}`, '1');
    expect(service.yaVisto(uid)).toBeTrue();
    expect(service.yaVisto('otro-usuario')).toBeFalse();
  });

  for (const [rol, ids] of [
    ['propietario', ['bienvenida', 'inicio']],
    ['guarda', ['bienvenida', 'inicio', 'vehiculos']],
    ['admin', ['bienvenida', 'inicio', 'avisos', 'vehiculos']],
  ] as const) {
    it(`muestra los pasos visibles que corresponden al perfil ${rol}`, async () => {
      mostrarNavegacion();
      const arrancar = spyOn(Shepherd.Tour.prototype, 'start').and.stub();
      const service = TestBed.inject(TourService);
      service.iniciar({ ...vecino, rol });
      service.iniciar({ ...vecino, rol });
      await Promise.resolve();

      expect(arrancar).toHaveBeenCalledTimes(1);
      const tour = arrancar.calls.mostRecent().object as InstanceType<typeof Shepherd.Tour>;
      expect(tour.steps.map(step => step.id)).toEqual([...ids]);
      expect(tour.getById('inicio')?.options.attachTo?.on).toBe('right');
      if (rol === 'admin') {
        expect(tour.getById('avisos')?.options.attachTo?.on).toBe('bottom');
      }
      if (rol !== 'propietario') {
        expect(tour.getById('vehiculos')?.options.attachTo?.on).toBe('top');
      }
      const continuar = spyOn(tour, 'next');
      const omitir = spyOn(tour, 'cancel');
      const botones = tour.steps[0].options.buttons!;
      botones[1].action?.call(tour);
      botones[0].action?.call(tour);
      expect(continuar).toHaveBeenCalledTimes(1);
      expect(omitir).toHaveBeenCalledTimes(1);
      expect(tour.steps[tour.steps.length - 1].options.buttons?.[1].text).toBe('Finalizar');
      tour.trigger(rol === 'admin' ? 'complete' : 'cancel');
      expect(service.yaVisto(uid)).toBeTrue();
    });
  }

  it('espera hasta que la navegación esté visible y no repite el recorrido visto', async () => {
    const clock = jasmine.clock();
    clock.install();
    try {
      const arrancar = spyOn(Shepherd.Tour.prototype, 'start').and.stub();
      const service = TestBed.inject(TourService);
      service.iniciarSiEsNuevo({ ...vecino, comunidadId: '' });
      service.iniciarSiEsNuevo(vecino);
      clock.tick(1200);
      expect(arrancar).not.toHaveBeenCalled();
      mostrarNavegacion();
      clock.tick(250);
      await Promise.resolve();
      await Promise.resolve();
      expect(arrancar).toHaveBeenCalledTimes(1);
      const tour = arrancar.calls.mostRecent().object as InstanceType<typeof Shepherd.Tour>;
      tour.trigger('complete');
      service.iniciarSiEsNuevo(vecino);
      clock.tick(1500);
      expect(arrancar).toHaveBeenCalledTimes(1);
    } finally {
      clock.uninstall();
    }
  });
});
