import { nombreFestivo } from './festivos.utils';

export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;

export const DIAS_PICO_PLACA = [
  { clave: 'lunes', etiqueta: 'Lunes' },
  { clave: 'martes', etiqueta: 'Martes' },
  { clave: 'miercoles', etiqueta: 'Miércoles' },
  { clave: 'jueves', etiqueta: 'Jueves' },
  { clave: 'viernes', etiqueta: 'Viernes' },
] as const;

// Medida vigente en Cali para el segundo semestre de 2026 (1 de julio a 31 de
// diciembre), de lunes a viernes de 6:00 a. m. a 7:00 p. m.; fines de semana y
// festivos no aplica. Es el valor por defecto: el administrador puede
// sobrescribirlo desde Inicio, y a partir de 2027 hay que configurarlo (la
// rotación cambia cada semestre y no se debe suponer).
export const PICO_PLACA_CALI_2026_S2 = {
  desde: '2026-07-01',
  hasta: '2026-12-31',
  horario: '6:00 a. m. a 7:00 p. m.',
  digitos: { lunes: '9 y 0', martes: '1 y 2', miercoles: '3 y 4', jueves: '5 y 6', viernes: '7 y 8' } as Record<string, string>,
};

export interface PicoPlacaHoy {
  etiquetaDia: string;
  // null: no hay restricción configurada ni vigente para este día.
  restriccion: string | null;
  // Fin de semana: la medida no aplica.
  finDeSemana: boolean;
  // Festivo en Colombia (calculado, ver festivos.utils): tampoco aplica.
  festivo: string | null;
  horario: string | null;
}

function fechaISO(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

function defectoVigente(fecha: Date): typeof PICO_PLACA_CALI_2026_S2 | null {
  const dia = fechaISO(fecha);
  return dia >= PICO_PLACA_CALI_2026_S2.desde && dia <= PICO_PLACA_CALI_2026_S2.hasta ? PICO_PLACA_CALI_2026_S2 : null;
}

// Lo configurado por el administrador manda; si no hay nada, se usa la tabla de
// Cali mientras esté vigente.
export function valorPicoPlaca(config: Record<string, string> | undefined, clave: string, fecha: Date = new Date()): string {
  const propio = (config?.[clave] ?? '').trim();
  return propio || defectoVigente(fecha)?.digitos[clave] || '';
}

export function picoPlacaDeHoy(config: Record<string, string> | undefined, fecha: Date = new Date()): PicoPlacaHoy {
  const clave = DIAS_SEMANA[fecha.getDay()];
  const finDeSemana = clave === 'sabado' || clave === 'domingo';
  const etiquetaDia = DIAS_PICO_PLACA.find(dia => dia.clave === clave)?.etiqueta ?? (clave === 'sabado' ? 'Sábado' : 'Domingo');

  if (finDeSemana) {
    return { etiquetaDia, restriccion: null, finDeSemana: true, festivo: null, horario: null };
  }

  const festivo = nombreFestivo(fecha);
  if (festivo) {
    return { etiquetaDia, restriccion: null, finDeSemana: false, festivo, horario: null };
  }

  const restriccion = valorPicoPlaca(config, clave, fecha) || null;
  const usaDefecto = !(config?.[clave] ?? '').trim();
  return {
    etiquetaDia,
    restriccion,
    finDeSemana: false,
    festivo: null,
    horario: restriccion && usaDefecto ? defectoVigente(fecha)?.horario ?? null : null,
  };
}
