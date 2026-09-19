import { Usuario } from '../models';

export interface Posicion {
  latitud: number;
  longitud: number;
  precisionMetros: number;
}

export const TIPOS_ALERTA_SOS = [
  'Emergencia médica',
  'Incendio',
  'Robo o intruso sospechoso',
  'Agresión o riña',
  'Fuga de gas o inundación',
  'Accidente',
  'Otra emergencia',
] as const;

// null cuando el permiso se niega, el dispositivo no tiene GPS o vence el
// tiempo: el SOS nunca debe quedar bloqueado por la ubicación.
export function obtenerPosicion(timeoutMs = 8000): Promise<Posicion | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitud: Number(pos.coords.latitude.toFixed(6)),
        longitud: Number(pos.coords.longitude.toFixed(6)),
        precisionMetros: Math.round(pos.coords.accuracy),
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}

export function enlaceMapa(latitud: number, longitud: number): string {
  return `https://www.google.com/maps?q=${latitud},${longitud}`;
}

export function formatearUnidad(usuario: Pick<Usuario, 'torre' | 'numeroApartamento'>, esCasas: boolean): string {
  if (!usuario.numeroApartamento) {
    return '';
  }
  if (esCasas) {
    return `Casa ${usuario.numeroApartamento}`;
  }
  return usuario.torre ? `Torre ${usuario.torre} - Apto ${usuario.numeroApartamento}` : `Apto ${usuario.numeroApartamento}`;
}
