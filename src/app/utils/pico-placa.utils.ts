export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

export const DIAS_PICO_PLACA = [
  { clave: 'lunes', etiqueta: 'Lunes' },
  { clave: 'martes', etiqueta: 'Martes' },
  { clave: 'miercoles', etiqueta: 'Miércoles' },
  { clave: 'jueves', etiqueta: 'Jueves' },
  { clave: 'viernes', etiqueta: 'Viernes' },
] as const;

export interface PicoPlacaHoy {
  etiquetaDia: string;
  // null: el administrador no ha configurado nada para este día.
  restriccion: string | null;
}

export function picoPlacaDeHoy(config: Record<string, string> | undefined, fecha: Date = new Date()): PicoPlacaHoy {
  const clave = DIAS_SEMANA[fecha.getDay()];
  const etiquetaDia = DIAS_PICO_PLACA.find(dia => dia.clave === clave)?.etiqueta
    ?? (clave === 'sabado' ? 'Sábado' : 'Domingo');
  const valor = (config?.[clave] ?? '').trim();
  return { etiquetaDia, restriccion: valor || null };
}
