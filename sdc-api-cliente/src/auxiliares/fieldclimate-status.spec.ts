import {
  fieldClimateStatus,
  parseFieldClimateDate,
} from './fieldclimate-status';

describe('estado de reporte FieldClimate', () => {
  const now = new Date('2026-07-13T18:00:00.000Z');

  it('interpreta las fechas sin zona como hora argentina', () => {
    expect(parseFieldClimateDate('2026-07-13 14:30:00')?.toISOString()).toBe(
      '2026-07-13T17:30:00.000Z',
    );
  });

  it('marca como reportando una lectura reciente', () => {
    expect(fieldClimateStatus('2026-07-13 14:30:00', now, 6)).toEqual({
      ultimaLectura: '2026-07-13 14:30:00',
      reportando: true,
      conexion: 'reportando',
    });
  });

  it('rechaza como actual una lectura antigua', () => {
    expect(fieldClimateStatus('2026-06-28 23:00:00', now, 6)).toMatchObject({
      reportando: false,
      conexion: 'sin_datos',
    });
  });
});
