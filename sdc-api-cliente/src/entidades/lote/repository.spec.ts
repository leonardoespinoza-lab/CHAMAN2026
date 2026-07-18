jest.mock('../../env', () => ({
  AGROMETEO_INTERNAL_TOKEN: 'agrometeo-token',
  LOT_LOCATION_INTERNAL_TOKEN: 'lot-location-token',
  SOIL_INTELLIGENCE_INTERNAL_TOKEN: 'soil-intelligence-token',
  API_CLIMA: 'http://clima',
  API_DATOS: 'http://datos',
  API_PREDICCIONES: 'http://predicciones',
}));

import { LotesRepository } from './repository';

describe('LotesRepository internal tokens', () => {
  it('usa el token dedicado solamente para endpoints de suelo', async () => {
    const axios = {
      GET: jest.fn().mockResolvedValue(null),
      POST: jest.fn().mockResolvedValue(null),
    };
    const repository = new LotesRepository(axios as any);

    await repository.getSoilIntelligence('lote-1');
    await repository.getSoilAgronomicInputs('lote-1');
    await repository.reprocessSoilIntelligence('lote-1');
    await repository.getAdministrativeLocation('lote-1');

    expect(axios.GET).toHaveBeenNthCalledWith(
      1,
      'http://datos/soil-intelligence/lots/lote-1',
      {
        headers: {
          'x-chaman-internal-token': 'soil-intelligence-token',
        },
      },
    );
    expect(axios.GET).toHaveBeenNthCalledWith(
      2,
      'http://datos/soil-intelligence/lots/lote-1/agronomic-inputs',
      {
        headers: {
          'x-chaman-internal-token': 'soil-intelligence-token',
        },
      },
    );
    expect(axios.POST).toHaveBeenCalledWith(
      'http://datos/soil-intelligence/lots/lote-1/reprocess',
      { reason: 'manual_retry', force: true },
      {
        headers: {
          'x-chaman-internal-token': 'soil-intelligence-token',
        },
      },
    );
    expect(axios.GET).toHaveBeenNthCalledWith(
      3,
      'http://datos/lot-locations/lotes/lote-1',
      {
        headers: {
          'x-chaman-internal-token': 'lot-location-token',
        },
      },
    );
  });

  it('consulta el clima canonico por siembra con el token interno', async () => {
    const axios = {
      GET: jest.fn().mockResolvedValue({ summary: {}, series: [] }),
    };
    const repository = new LotesRepository(axios as any);

    await repository.getAgrometeorologia('siembra-1');

    expect(axios.GET).toHaveBeenCalledWith(
      'http://clima/agrometeorologia/siembras/siembra-1',
      {
        headers: {
          'x-chaman-internal-token': 'agrometeo-token',
        },
      },
    );
  });
});
