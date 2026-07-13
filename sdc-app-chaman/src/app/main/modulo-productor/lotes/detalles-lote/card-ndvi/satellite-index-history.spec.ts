import { IReporteNDVI } from 'modelos/src';
import { buildSatelliteIndexHistory, satelliteIndexValue } from './satellite-index-history';

describe('satellite-index-history', () => {
  it('ordena las escenas por fecha y conserva una lectura valida igual a cero', () => {
    const reports: IReporteNDVI[] = [
      {
        _id: 'new',
        fechaDeLaImagen: '2026-07-10T00:00:00.000Z',
        indices: { ndwi: 0.2 },
      },
      {
        _id: 'old',
        fechaDeLaImagen: '2026-07-02T00:00:00.000Z',
        indices: { ndwi: 0 },
      },
    ];

    const points = buildSatelliteIndexHistory(reports, 'ndwi', (date) => ({
      name: date.getUTCDate() < 5 ? 'Emergencia' : 'Vegetativo',
      source: 'Cronología de la siembra',
      confirmed: false,
    }));

    expect(points.map((point) => point.reportId)).toEqual(['old', 'new']);
    expect(points[0].value).toBe(0);
    expect(points[0].stage.name).toBe('Emergencia');
  });

  it('usa ndviPromedio como respaldo para reportes NDVI historicos', () => {
    expect(satelliteIndexValue({ ndviPromedio: 0.47 }, 'ndvi')).toBe(0.47);
  });

  it('marca lecturas faltantes o fuera del rango normalizado sin inventar valores', () => {
    const reports: IReporteNDVI[] = [
      { _id: 'missing', fechaDeLaImagen: '2026-07-02T00:00:00.000Z', indices: {} },
      { _id: 'invalid', fechaDeLaImagen: '2026-07-10T00:00:00.000Z', indices: { savi: 1.4 } },
    ];

    const points = buildSatelliteIndexHistory(reports, 'savi', () => ({
      name: 'Sin etapa confirmada',
      source: 'Sin referencia histórica',
      confirmed: false,
    }));

    expect(points.map((point) => point.value)).toEqual([null, null]);
    expect(points.map((point) => point.invalidReason)).toEqual(['missing', 'out_of_range']);
  });

  it('ignora reportes sin una fecha de escena util', () => {
    const points = buildSatelliteIndexHistory([{ _id: 'undated', indices: { ndvi: 0.6 } }], 'ndvi', () => ({
      name: 'Vegetativo',
      source: 'Campo',
      confirmed: true,
    }));

    expect(points).toEqual([]);
  });
});
