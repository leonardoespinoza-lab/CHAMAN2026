import { IReporteNDVI } from 'modelos/src';
import { buildSatelliteIndexHistory, satelliteIndexValue } from './satellite-index-history';

describe('satellite-index-history', () => {
  const qualityMetadata = (key: string, coverage = 80, status: 'ok' | 'warning' | 'error' = 'ok') =>
    ({
      renderVersion: 'fixed-index-v3',
      qualityMask: { validCoveragePct: coverage },
      renderQa: { [key]: { status, validCoveragePct: coverage } },
    }) as any;

  it('ordena las escenas por fecha y conserva una lectura valida igual a cero', () => {
    const reports: IReporteNDVI[] = [
      {
        _id: 'new',
        fechaDeLaImagen: '2026-07-10T00:00:00.000Z',
        indices: { ndwi: 0.2 },
        metadataImagen: qualityMetadata('ndwi'),
      },
      {
        _id: 'old',
        fechaDeLaImagen: '2026-07-02T00:00:00.000Z',
        indices: { ndwi: 0 },
        metadataImagen: qualityMetadata('ndwi'),
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

  it('solo usa ndviPromedio historico cuando conserva evidencia QA suficiente', () => {
    expect(satelliteIndexValue({ ndviPromedio: 0.47 }, 'ndvi')).toBeNull();
    expect(
      satelliteIndexValue(
        {
          ndviPromedio: 0.47,
          metadataImagen: { qualityMask: { validCoveragePct: 76 } } as any,
        },
        'ndvi'
      )
    ).toBe(0.47);
  });

  it('bloquea cobertura insuficiente y exige QA ok para render v3', () => {
    expect(
      satelliteIndexValue(
        { indices: { ndvi: 0.48 }, metadataImagen: qualityMetadata('ndvi', 2.99) },
        'ndvi'
      )
    ).toBeNull();
    expect(
      satelliteIndexValue(
        { indices: { ndvi: 0.48 }, metadataImagen: qualityMetadata('ndvi', 85, 'warning') },
        'ndvi'
      )
    ).toBeNull();
    expect(
      satelliteIndexValue(
        {
          indices: { ndvi: 0.48 },
          metadataImagen: {
            renderVersion: 'fixed-index-v3',
            qualityMask: { validCoveragePct: 85 },
          } as any,
        },
        'ndvi'
      )
    ).toBeNull();
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

  it('distingue una lectura numerica bloqueada por calidad', () => {
    const points = buildSatelliteIndexHistory(
      [
        {
          _id: 'poor-quality',
          fechaDeLaImagen: '2026-07-10T00:00:00.000Z',
          indices: { ndvi: 0.44 },
          metadataImagen: qualityMetadata('ndvi', 1.5),
        },
      ],
      'ndvi',
      () => ({ name: 'Vegetativo', source: 'Campo', confirmed: true })
    );

    expect(points[0].value).toBeNull();
    expect(points[0].invalidReason).toBe('quality');
    expect(points[0].qualityCoveragePct).toBe(1.5);
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
