import { Reserva, ZonaComun } from '../models';

export interface GrupoReserva {
  zonaId: string;
  zonaNombre: string;
  usuarioId: string;
  usuarioNombre: string;
  torre?: string;
  apartamento?: string;
  fecha: string;
  horaInicio: number;
  horaFin: number;
  ids: string[];
}

export function idReserva(zonaId: string, fecha: string, hora: number): string {
  return `${zonaId}_${fecha}_${hora}`;
}

// Horas reservables de una zona: apertura incluida, cierre excluido.
export function horasDeZona(zona: Pick<ZonaComun, 'horaApertura' | 'horaCierre'>): number[] {
  const horas: number[] = [];
  for (let hora = zona.horaApertura; hora < zona.horaCierre; hora++) {
    horas.push(hora);
  }
  return horas;
}

// Inicio del bloque en hora local del dispositivo.
export function inicioDeBloque(fecha: string, hora: number): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia, hora, 0, 0, 0);
}

export function fechaLocalISO(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

export function etiquetaHora(hora: number): string {
  const h = hora % 24;
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${sufijo}`;
}

// Une los bloques consecutivos de un mismo vecino, zona y día en una sola
// reserva para mostrarla ("2:00 p. m. – 5:00 p. m."), ordenadas por fecha.
export function agruparReservas(reservas: Reserva[]): GrupoReserva[] {
  const ordenadas = [...reservas].sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
    || a.zonaId.localeCompare(b.zonaId)
    || a.usuarioId.localeCompare(b.usuarioId)
    || a.hora - b.hora
  );

  const grupos: GrupoReserva[] = [];
  for (const reserva of ordenadas) {
    const id = reserva.idReserva || idReserva(reserva.zonaId, reserva.fecha, reserva.hora);
    const ultimo = grupos[grupos.length - 1];
    if (
      ultimo
      && ultimo.zonaId === reserva.zonaId
      && ultimo.usuarioId === reserva.usuarioId
      && ultimo.fecha === reserva.fecha
      && ultimo.horaFin === reserva.hora
    ) {
      ultimo.horaFin = reserva.hora + 1;
      ultimo.ids.push(id);
    } else {
      grupos.push({
        zonaId: reserva.zonaId,
        zonaNombre: reserva.zonaNombre,
        usuarioId: reserva.usuarioId,
        usuarioNombre: reserva.usuarioNombre,
        torre: reserva.torre,
        apartamento: reserva.apartamento,
        fecha: reserva.fecha,
        horaInicio: reserva.hora,
        horaFin: reserva.hora + 1,
        ids: [id],
      });
    }
  }

  return grupos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio - b.horaInicio);
}

// Selección de bloques contiguos: tocar un bloque libre junto al rango lo
// extiende (hasta maxHoras); tocar un extremo lo quita; cualquier otro
// empieza una selección nueva.
export function alternarBloque(seleccion: number[], hora: number, maxHoras: number): number[] {
  if (!seleccion.length) {
    return [hora];
  }
  const primero = seleccion[0];
  const ultimo = seleccion[seleccion.length - 1];

  if (seleccion.includes(hora)) {
    if (hora === primero) {
      return seleccion.slice(1);
    }
    if (hora === ultimo) {
      return seleccion.slice(0, -1);
    }
    return [hora];
  }
  if (hora === ultimo + 1 && seleccion.length < maxHoras) {
    return [...seleccion, hora];
  }
  if (hora === primero - 1 && seleccion.length < maxHoras) {
    return [hora, ...seleccion];
  }
  return [hora];
}
