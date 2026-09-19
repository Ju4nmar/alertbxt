import { Pipe, PipeTransform } from '@angular/core';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const SEMANA = 7 * DIA;
const MES = 30 * DIA;
const ANIO = 365 * DIA;

const UNIDADES: [ms: number, singular: string, plural: string][] = [
  [MINUTO, 'minuto', 'minutos'],
  [HORA, 'hora', 'horas'],
  [DIA, 'día', 'días'],
  [SEMANA, 'semana', 'semanas'],
  [MES, 'mes', 'meses'],
  [ANIO, 'año', 'años'],
];

// "hace 2 horas" / "en 3 días" — complementa la fecha absoluta, no la
// reemplaza (ver *-eventos.page.html): un vecino entiende de un vistazo si
// algo es reciente o si un recordatorio vence pronto, sin tener que restar
// fechas mentalmente.
@Pipe({
  name: 'tiempoRelativo',
  standalone: true,
  // impure a propósito: sin esto, "hace 2 minutos" se queda congelado hasta
  // el próximo cambio de datos aunque pasen las horas. Las listas donde se
  // usa son cortas (decenas de tarjetas, no miles), así que el costo de
  // reevaluar en cada ciclo de detección de cambios es despreciable.
  pure: false,
})
export class TiempoRelativoPipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    if (!value) {
      return '';
    }

    const fecha = typeof value === 'string' ? new Date(value) : value;
    const ms = fecha.getTime();
    if (Number.isNaN(ms)) {
      return '';
    }

    const diffMs = ms - Date.now();
    const futuro = diffMs >= 0;
    const absMs = Math.abs(diffMs);

    if (absMs < MINUTO) {
      return futuro ? 'en instantes' : 'hace instantes';
    }

    let [, singular, plural] = UNIDADES[0];
    let cantidad = Math.floor(absMs / UNIDADES[0][0]);

    for (const [unidadMs, unidadSingular, unidadPlural] of UNIDADES) {
      const valor = Math.floor(absMs / unidadMs);
      if (valor < 1) {
        break;
      }
      cantidad = valor;
      singular = unidadSingular;
      plural = unidadPlural;
    }

    const etiqueta = cantidad === 1 ? singular : plural;
    return futuro ? `en ${cantidad} ${etiqueta}` : `hace ${cantidad} ${etiqueta}`;
  }
}
