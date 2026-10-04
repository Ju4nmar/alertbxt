import { Reserva } from '../models';
import { agruparReservas, alternarBloque, etiquetaHora, fechaLocalISO, horasDeZona, idReserva, inicioDeBloque } from './reservas.utils';

const reserva = (usuarioId: string, hora: number, extra: Partial<Reserva> = {}): Reserva => ({
  zonaId: 'z1', zonaNombre: 'Salón', comunidadId: 'c1', usuarioId, usuarioNombre: usuarioId,
  fecha: '2026-10-10', hora, inicio: '', ...extra,
});

describe('reservas.utils', () => {
  it('arma el id determinista del bloque', () => {
    expect(idReserva('z1', '2026-10-10', 14)).toBe('z1_2026-10-10_14');
  });

  it('lista las horas con apertura incluida y cierre excluido', () => {
    expect(horasDeZona({ horaApertura: 8, horaCierre: 11 })).toEqual([8, 9, 10]);
  });

  it('calcula el inicio local del bloque y la fecha ISO local', () => {
    const inicio = inicioDeBloque('2026-10-10', 14);
    expect([inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), inicio.getHours()]).toEqual([2026, 9, 10, 14]);
    expect(fechaLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('formatea la hora en 12 horas', () => {
    expect(etiquetaHora(0)).toBe('12:00 a. m.');
    expect(etiquetaHora(13)).toBe('1:00 p. m.');
    expect(etiquetaHora(12)).toBe('12:00 p. m.');
  });

  describe('agruparReservas', () => {
    it('une bloques consecutivos del mismo vecino', () => {
      const grupos = agruparReservas([reserva('a', 15), reserva('a', 14), reserva('a', 16)]);
      expect(grupos.length).toBe(1);
      expect(grupos[0].horaInicio).toBe(14);
      expect(grupos[0].horaFin).toBe(17);
      expect(grupos[0].ids).toEqual(['z1_2026-10-10_14', 'z1_2026-10-10_15', 'z1_2026-10-10_16']);
    });

    it('separa por vecino, por hueco y por día, ordenado cronológicamente', () => {
      const grupos = agruparReservas([
        reserva('a', 10), reserva('a', 12), reserva('b', 11), reserva('a', 9, { fecha: '2026-10-09' }),
      ]);
      expect(grupos.map(g => `${g.fecha}|${g.usuarioId}|${g.horaInicio}-${g.horaFin}`)).toEqual([
        '2026-10-09|a|9-10', '2026-10-10|a|10-11', '2026-10-10|b|11-12', '2026-10-10|a|12-13',
      ]);
    });
  });

  describe('alternarBloque', () => {
    it('empieza una selección y la extiende por los lados hasta el máximo', () => {
      let sel = alternarBloque([], 10, 3);
      sel = alternarBloque(sel, 11, 3);
      sel = alternarBloque(sel, 9, 3);
      expect(sel).toEqual([9, 10, 11]);
      expect(alternarBloque(sel, 12, 3)).toEqual([12]);
    });

    it('quita un extremo o reinicia al tocar el centro o un bloque lejano', () => {
      expect(alternarBloque([9, 10, 11], 9, 3)).toEqual([10, 11]);
      expect(alternarBloque([9, 10, 11], 11, 3)).toEqual([9, 10]);
      expect(alternarBloque([9, 10, 11], 10, 3)).toEqual([10]);
      expect(alternarBloque([9, 10], 15, 3)).toEqual([15]);
    });
  });
});
