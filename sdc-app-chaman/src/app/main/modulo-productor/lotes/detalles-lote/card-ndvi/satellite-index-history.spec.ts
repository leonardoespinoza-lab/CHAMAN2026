import { IReporteNDVI } from 'modelos/src';
import {
  buildSatelliteIndexHistory,
  operationalSatelliteIndexKeys,
  parseSatelliteCalendarDate,
  satelliteReportIsOperational,
  satelliteIndexValue,
} from './satellite-index-history';

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
        { indices: { ndvi: 0.48 }, metadataImagen: qualityMetadata('ndvi', 49.99) },
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

  it('oculta del historial comercial escenas archivadas o sin raster', () => {
    const poorQuality = {
      indices: { ndvi: 0.48 },
      imagenes: { ndvi: 'https://example.test/ndvi.png' },
      metadataImagen: qualityMetadata('ndvi', 45.91),
    } as IReporteNDVI;
    const withoutRaster = {
      indices: { ndvi: 0.48 },
      metadataImagen: qualityMetadata('ndvi', 85),
    } as IReporteNDVI;
    const operational = {
      indices: { ndvi: 0.48, ndmi: -0.1 },
      imagenes: {
        ndvi: 'https://example.test/ndvi.png',
        ndmi: 'https://example.test/ndmi.png',
      },
      metadataImagen: {
        ...qualityMetadata('ndvi', 85),
        renderQa: {
          ndvi: { status: 'ok', validCoveragePct: 85 },
          ndmi: { status: 'ok', validCoveragePct: 85 },
        },
      },
    } as IReporteNDVI;

    expect(satelliteReportIsOperational(poorQuality)).toBeFalse();
    expect(satelliteReportIsOperational(withoutRaster)).toBeFalse();
    expect(satelliteReportIsOperational(operational)).toBeTrue();
    expect(operationalSatelliteIndexKeys(operational)).toEqual(['ndvi', 'ndmi']);
  });

  it('conserva el dia calendario de Sentinel en la zona horaria argentina', () => {
    const date = parseSatelliteCalendarDate('2026-07-17T00:00:00.000Z');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(17);
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
