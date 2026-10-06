import { TestBed } from '@angular/core/testing';
import { ConexionService } from './conexion.service';

describe('ConexionService', () => {
  let servicio: ConexionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(ConexionService);
  });

  it('refleja los eventos offline y online del navegador', () => {
    const estados: boolean[] = [];
    const sub = servicio.enLinea$.subscribe(valor => estados.push(valor));

    window.dispatchEvent(new Event('offline'));
    expect(servicio.enLinea).toBeFalse();

    window.dispatchEvent(new Event('online'));
    expect(servicio.enLinea).toBeTrue();

    expect(estados.slice(-2)).toEqual([false, true]);
    sub.unsubscribe();
  });
});
