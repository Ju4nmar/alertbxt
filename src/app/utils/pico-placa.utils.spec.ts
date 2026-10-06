import { picoPlacaDeHoy, valorPicoPlaca } from './pico-placa.utils';

describe('picoPlacaDeHoy', () => {
  const lunes = new Date(2026, 9, 5);
  const miercoles = new Date(2026, 9, 7);
  const sabado = new Date(2026, 9, 10);
  const lunes2027 = new Date(2027, 0, 4);

  it('usa la tabla de Cali del segundo semestre de 2026 si no hay configuración', () => {
    expect(picoPlacaDeHoy(undefined, lunes)).toEqual(jasmine.objectContaining({
      etiquetaDia: 'Lunes', restriccion: '9 y 0', horario: '6:00 a. m. a 7:00 p. m.',
    }));
    expect(picoPlacaDeHoy({}, miercoles).restriccion).toBe('3 y 4');
  });

  it('lo configurado por el administrador tiene prioridad (y recorta espacios)', () => {
    const resultado = picoPlacaDeHoy({ lunes: ' 1 y 2 ' }, lunes);
    expect(resultado.restriccion).toBe('1 y 2');
    expect(resultado.horario).toBeNull();
  });

  it('fuera del periodo vigente no supone nada: queda sin dato hasta configurarlo', () => {
    expect(picoPlacaDeHoy(undefined, lunes2027).restriccion).toBeNull();
    expect(picoPlacaDeHoy({ lunes: '3 y 4' }, lunes2027).restriccion).toBe('3 y 4');
  });

  it('en fin de semana no aplica restricción', () => {
    expect(picoPlacaDeHoy({}, sabado)).toEqual(jasmine.objectContaining({ etiquetaDia: 'Sábado', restriccion: null, finDeSemana: true }));
  });

  it('en un festivo no aplica restricción, aunque el día sea hábil', () => {
    const diaDeLaRaza = new Date(2026, 9, 12);
    expect(picoPlacaDeHoy(undefined, diaDeLaRaza)).toEqual(jasmine.objectContaining({
      restriccion: null, finDeSemana: false, festivo: 'Día de la Raza',
    }));
  });

  it('valorPicoPlaca devuelve el valor vigente de un día concreto', () => {
    expect(valorPicoPlaca(undefined, 'viernes', lunes)).toBe('7 y 8');
    expect(valorPicoPlaca({ viernes: '1 y 2' }, 'viernes', lunes)).toBe('1 y 2');
  });
});
