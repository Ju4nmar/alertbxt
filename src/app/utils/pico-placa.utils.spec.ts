import { picoPlacaDeHoy } from './pico-placa.utils';

describe('picoPlacaDeHoy', () => {
  const lunes = new Date(2026, 9, 5);
  const sabado = new Date(2026, 9, 10);

  it('devuelve la restricción configurada para el día', () => {
    expect(picoPlacaDeHoy({ lunes: ' 1 y 2 ' }, lunes)).toEqual({ etiquetaDia: 'Lunes', restriccion: '1 y 2' });
  });

  it('devuelve null si el día no tiene valor o no hay configuración', () => {
    expect(picoPlacaDeHoy({ martes: '3 y 4' }, lunes).restriccion).toBeNull();
    expect(picoPlacaDeHoy(undefined, lunes).restriccion).toBeNull();
  });

  it('nombra bien los días de fin de semana', () => {
    expect(picoPlacaDeHoy({}, sabado).etiquetaDia).toBe('Sábado');
  });
});
