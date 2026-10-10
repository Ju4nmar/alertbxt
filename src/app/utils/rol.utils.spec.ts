import { etiquetaRol } from './rol.utils';

describe('etiquetaRol', () => {
  it('devuelve la etiqueta visible de cada rol', () => {
    expect(etiquetaRol('admin')).toBe('Administrador');
    expect(etiquetaRol('arrendatario')).toBe('Arrendatario');
    expect(etiquetaRol('guarda')).toBe('Guarda');
    expect(etiquetaRol('propietario')).toBe('Propietario');
  });

  it("trata el valor histórico 'residente' como Propietario", () => {
    expect(etiquetaRol('residente')).toBe('Propietario');
  });

  it('devuelve vacío si el rol no existe', () => {
    expect(etiquetaRol(undefined)).toBe('');
  });
});
