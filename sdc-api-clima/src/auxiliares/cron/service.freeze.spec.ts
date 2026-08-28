jest.mock('../../env', () => ({
  CLIMA_LEGACY_CRONS_ENABLED: false,
  CRON_TEST: false,
  FIELD_CLIMATE_PASS: [],
  FIELD_CLIMATE_USERS: [],
}));
jest.mock('../../entidades/estacion/service', () => ({
  EstacionsService: class {},
}));
jest.mock('../../entidades/fieldClimate/service', () => ({
  FieldClimateService: class {},
}));
jest.mock('../logsService/service', () => ({
  LogService: class {
    debug() {}
    error() {}
    verbose() {}
    warn() {}
  },
}));
jest.mock('src/entidades/omixom/service', () => ({ OmixomService: class {} }));
jest.mock('src/entidades/lote/service', () => ({ LotesService: class {} }));
jest.mock('src/entidades/clima/service', () => ({ ClimaService: class {} }));

import { CronService } from './service';

describe('CronService freeze', () => {
  function createService() {
    const estaciones = { upsertMany: jest.fn(), getFiltered: jest.fn() };
    const fieldClimate = { getStations: jest.fn() };
    const omixom = { getEstaciones: jest.fn().mockResolvedValue([]) };
    const lotes = { get: jest.fn(), update: jest.fn() };
    const climas = { getLastData: jest.fn() };
    const service = new CronService(
      estaciones as any,
      fieldClimate as any,
      omixom as any,
      lotes as any,
      climas as any,
    );
    return { service, estaciones, fieldClimate, omixom, lotes };
  }

  it('no consulta ni escribe estaciones o lotes cuando el cron legacy esta apagado', async () => {
    const { service } = createService();
    const actualizar = jest.spyOn(service, 'actualizarEstaciones');
    const calcular = jest.spyOn(service, 'calcularNiveles');

    await service.actualizarEstacionesAutomaticamente();
    await service.calcularNivelesAutomaticamente();

    expect(actualizar).not.toHaveBeenCalled();
    expect(calcular).not.toHaveBeenCalled();
  });

  it('mantiene disponible la actualizacion manual con el cron apagado', async () => {
    const { service, omixom } = createService();

    await service.actualizarEstaciones();

    expect(omixom.getEstaciones).toHaveBeenCalledTimes(1);
  });
});
