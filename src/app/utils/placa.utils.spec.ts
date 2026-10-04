import { esPlacaValida, normalizarPlaca } from './placa.utils';

describe('placa.utils', () => {
  it('normaliza a mayúsculas sin espacios ni guiones', () => {
    expect(normalizarPlaca(' abc-123 ')).toBe('ABC123');
    expect(normalizarPlaca(undefined)).toBe('');
  });

  it('valida entre 5 y 7 caracteres alfanuméricos', () => {
    expect(esPlacaValida('ABC123')).toBeTrue();
    expect(esPlacaValida('ABC12D')).toBeTrue();
    expect(esPlacaValida('AB12')).toBeFalse();
    expect(esPlacaValida('ABCDEFGH')).toBeFalse();
    expect(esPlacaValida('ABC 12')).toBeFalse();
  });
});
