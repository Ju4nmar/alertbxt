import { TiempoRelativoPipe } from './tiempo-relativo.pipe';

describe('TiempoRelativoPipe', () => {
  let pipe: TiempoRelativoPipe;

  beforeEach(() => {
    pipe = new TiempoRelativoPipe();
    spyOn(Date, 'now').and.returnValue(new Date('2026-06-15T12:00:00Z').getTime());
  });

  it('devuelve vacío para valores nulos o inválidos', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('no-es-una-fecha')).toBe('');
  });

  it('reporta instantes para diferencias menores a un minuto', () => {
    expect(pipe.transform('2026-06-15T11:59:45Z')).toBe('hace instantes');
    expect(pipe.transform('2026-06-15T12:00:15Z')).toBe('en instantes');
  });

  it('usa singular cuando la cantidad es 1', () => {
    expect(pipe.transform('2026-06-15T11:00:00Z')).toBe('hace 1 hora');
    expect(pipe.transform('2026-06-16T12:00:00Z')).toBe('en 1 día');
  });

  it('usa plural para cantidades mayores a 1, en pasado y futuro', () => {
    expect(pipe.transform('2026-06-15T10:00:00Z')).toBe('hace 2 horas');
    expect(pipe.transform('2026-06-17T12:00:00Z')).toBe('en 2 días');
  });

  it('escala a la unidad más grande disponible (meses, años)', () => {
    expect(pipe.transform('2026-04-15T12:00:00Z')).toBe('hace 2 meses');
    expect(pipe.transform('2027-06-16T12:00:00Z')).toBe('en 1 año');
  });
});
