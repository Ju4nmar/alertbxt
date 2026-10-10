// Festivos de Colombia calculados (sin API ni datos que mantener): la Ley 51
// de 1983 (Ley Emiliani) y las fechas que dependen de la Semana Santa.
//  - Fijos: no se trasladan.
//  - Emiliani: si no caen lunes, pasan al lunes siguiente.
//  - Semana Santa: jueves y viernes santos fijos; Ascensión, Corpus Christi y
//    Sagrado Corazón se trasladan al lunes.

export interface Festivo {
  fecha: string; // YYYY-MM-DD
  nombre: string;
}

const dos = (n: number) => String(n).padStart(2, '0');

function iso(fecha: Date): string {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
}

// Si no es lunes, pasa al lunes siguiente.
function aLunes(fecha: Date): Date {
  const dia = fecha.getDay();
  return dia === 1 ? fecha : sumarDias(fecha, (8 - dia) % 7);
}

// Domingo de Pascua (algoritmo anónimo gregoriano de Meeus/Jones/Butcher).
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

export function festivosColombia(anio: number): Festivo[] {
  const fijo = (mes: number, dia: number, nombre: string): Festivo => ({ fecha: iso(new Date(anio, mes - 1, dia)), nombre });
  const emiliani = (mes: number, dia: number, nombre: string): Festivo => ({ fecha: iso(aLunes(new Date(anio, mes - 1, dia))), nombre });
  const pascua = domingoDePascua(anio);
  const desdePascua = (dias: number, nombre: string, trasladar: boolean): Festivo => {
    const fecha = sumarDias(pascua, dias);
    return { fecha: iso(trasladar ? aLunes(fecha) : fecha), nombre };
  };

  return [
    fijo(1, 1, 'Año Nuevo'),
    emiliani(1, 6, 'Día de los Reyes Magos'),
    emiliani(3, 19, 'Día de San José'),
    desdePascua(-3, 'Jueves Santo', false),
    desdePascua(-2, 'Viernes Santo', false),
    fijo(5, 1, 'Día del Trabajo'),
    desdePascua(39, 'Ascensión del Señor', true),
    desdePascua(60, 'Corpus Christi', true),
    desdePascua(68, 'Sagrado Corazón de Jesús', true),
    emiliani(6, 29, 'San Pedro y San Pablo'),
    fijo(7, 20, 'Día de la Independencia'),
    fijo(8, 7, 'Batalla de Boyacá'),
    emiliani(8, 15, 'Asunción de la Virgen'),
    emiliani(10, 12, 'Día de la Raza'),
    emiliani(11, 1, 'Todos los Santos'),
    emiliani(11, 11, 'Independencia de Cartagena'),
    fijo(12, 8, 'Inmaculada Concepción'),
    fijo(12, 25, 'Navidad'),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Nombre del festivo de ese día, o null si es un día hábil/normal.
export function nombreFestivo(fecha: Date): string | null {
  const dia = iso(fecha);
  return festivosColombia(fecha.getFullYear()).find(festivo => festivo.fecha === dia)?.nombre ?? null;
}
