import { enlaceMapa, formatearUnidad, obtenerPosicion } from './ubicacion.utils';

describe('ubicacion.utils', () => {
  it('formatea la unidad según el tipo de comunidad', () => {
    expect(formatearUnidad({ torre: '3', numeroApartamento: '502' }, false)).toBe('Torre 3 - Apto 502');
    expect(formatearUnidad({ torre: 'B', numeroApartamento: '12' }, false)).toBe('Torre B - Apto 12');
    expect(formatearUnidad({ numeroApartamento: '502' }, false)).toBe('Apto 502');
    expect(formatearUnidad({ torre: '3', numeroApartamento: '7' }, true)).toBe('Casa 7');
    expect(formatearUnidad({ torre: '3' }, false)).toBe('');
  });

  it('arma el enlace de mapa con las coordenadas', () => {
    expect(enlaceMapa(3.451612, -76.531999)).toBe('https://www.google.com/maps?q=3.451612,-76.531999');
  });

  it('devuelve null si se niega el permiso de ubicación', async () => {
    spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((_ok, error) => error?.({} as GeolocationPositionError));
    expect(await obtenerPosicion(100)).toBeNull();
  });

  it('redondea coordenadas y precisión', async () => {
    spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake(ok =>
      ok({ coords: { latitude: 3.45161234, longitude: -76.53199876, accuracy: 14.6 } } as GeolocationPosition)
    );
    expect(await obtenerPosicion(100)).toEqual({ latitud: 3.451612, longitud: -76.531999, precisionMetros: 15 });
  });
});
