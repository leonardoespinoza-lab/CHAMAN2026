jest.mock('../../env', () => ({
  AGROMETEO_INTERNAL_TOKEN: 'agrometeo-token',
  API_CLIMA: 'http://clima',
  API_DATOS: 'http://datos',
}));

import {
  CATALOGO_CULTIVOS_FORMATO_VERSION,
  IImportacionCatalogoCultivosRequest,
  IResultadoImportacionCatalogoCultivos,
} from 'modelos/src';
import { SemillasRepository } from './repository';

describe('SemillasRepository - importacion de catalogo', () => {
  it('envia el contrato compartido al endpoint de datos', async () => {
    const body: IImportacionCatalogoCultivosRequest = {
      formatoVersion: CATALOGO_CULTIVOS_FORMATO_VERSION,
      modo: 'previsualizar',
      filas: [],
    };
    const response: IResultadoImportacionCatalogoCultivos = {
      formatoVersion: CATALOGO_CULTIVOS_FORMATO_VERSION,
      modo: 'previsualizar',
      planHash: 'plan-abc',
      altas: 0,
      actualizaciones: 0,
      sinCambios: 0,
      errores: [],
      cambios: [],
    };
    const axios = {
      POST: jest.fn().mockResolvedValue(response),
    };
    const repository = new SemillasRepository(axios as any);

    await expect(repository.importar(body)).resolves.toBe(response);

    expect(axios.POST).toHaveBeenCalledTimes(1);
    expect(axios.POST).toHaveBeenCalledWith(
      'http://datos/semillas/importar',
      body,
    );
  });
});
