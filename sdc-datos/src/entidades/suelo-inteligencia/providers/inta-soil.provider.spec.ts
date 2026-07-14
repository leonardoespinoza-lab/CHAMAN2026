import axios from 'axios';
import { IntaSoilTextNormalizer } from '../inta-normalizer.service';
import { IntaSoilProvider } from './inta-soil.provider';

describe('IntaSoilProvider', () => {
  const geometry = {
    geometryHash: 'inta-polygon',
    areaM2: 1_230_846,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0.01],
          [0, 0],
        ],
      ],
    },
    representativePoint: {
      type: 'Point' as const,
      coordinates: [0.005, 0.005] as [number, number],
    },
    warnings: [],
    swappedCoordinates: false,
  };

  afterEach(() => jest.restoreAllMocks());

  it('consulta capas configuradas por WFS y calcula la interseccion completa', async () => {
    jest.spyOn(axios, 'get').mockImplementation(async (_url, options: any) => {
      const national =
        options.params.typeNames === 'geonode:suelos_argentina_1_500';
      return {
        data: {
          features: [
            {
              id: national ? 'national.1' : 'regional.1',
              geometry: geometry.geometry,
              properties: national
                ? {
                    ogc_fid: 1,
                    simbc: 'N1',
                    text_sups1: 'Franco limoso',
                    drenaje_s1: 'Bien drenado',
                  }
                : {
                    OBJECTID_1: 10,
                    SIMBC: 'BA1',
                    Nombre_UC: 'Asociación de prueba',
                    SERIE1: 'Pergamino',
                  },
            },
          ],
        },
      } as any;
    });
    const provider = new IntaSoilProvider(new IntaSoilTextNormalizer());
    const result = await provider.assess(geometry, 'Buenos Aires');

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(result.units).toHaveLength(2);
    expect(result.units.every((unit) => (unit.areaPercentage || 0) > 95)).toBe(
      true,
    );
    expect(result.directTexture).toBe('Franco limoso');
    expect(result.units.find((unit) => unit.seriesName)?.seriesName).toBe(
      'Pergamino',
    );
    expect(
      result.units.find((unit) => unit.drainageClass === 'well'),
    ).toBeTruthy();
  });
});
