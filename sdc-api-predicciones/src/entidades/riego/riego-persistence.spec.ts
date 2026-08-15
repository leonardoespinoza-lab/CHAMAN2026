import { RiegoService } from './service';

const PROFUNDIDADES = Array.from({ length: 12 }, (_, index) => (index + 1) * 10);

describe('RiegoService - invalidacion segura de persistencia', () => {
  it('no crea una prediccion bloqueada y limpia serie y agua util anteriores', async () => {
    const contexto = crearContexto({ sueloConfirmadoPorUsuario: false });

    await contexto.service.prediccion('siembra-1');

    expect(contexto.prediccionRiegoService.create).not.toHaveBeenCalled();
    expect(contexto.siembrasService.update).toHaveBeenCalledTimes(1);
    expect(contexto.siembrasService.update).toHaveBeenLastCalledWith(
      'siembra-1',
      expect.objectContaining({
        ultimaPrediccionRiego: [],
        aguaUtilReal: null,
        estadoCalculoAguaUtil: 'no_disponible',
        estadoRecomendacionRiego: 'no_disponible',
        fuenteRecomendacionRiego: null,
      }),
    );
  });

  it('un fallo parcial al guardar intenta invalidar el estado que pudo quedar vigente', async () => {
    const contexto = crearContexto({ sueloConfirmadoPorUsuario: true });
    contexto.prediccionRiegoService.create.mockRejectedValueOnce(
      new Error('fallo parcial de prediccion'),
    );

    await contexto.service.prediccion('siembra-1');

    expect(contexto.prediccionRiegoService.create).toHaveBeenCalledTimes(1);
    expect(contexto.siembrasService.update.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(contexto.siembrasService.update).toHaveBeenLastCalledWith(
      'siembra-1',
      expect.objectContaining({
        ultimaPrediccionRiego: [],
        aguaUtilReal: null,
        estadoCalculoAguaUtil: 'no_disponible',
        estadoRecomendacionRiego: 'no_disponible',
        fuenteRecomendacionRiego: null,
        motivoRecomendacionRiego: expect.stringContaining('fallo la persistencia'),
      }),
    );
    expect(contexto.httpsService.send).not.toHaveBeenCalled();
  });
});

function crearContexto(options: { sueloConfirmadoPorUsuario: boolean }) {
  const ahora = Date.now();
  const lote = {
    _id: 'lote-1',
    nombre: 'Lote con Sentek',
    ubicacion: { centro: { lat: -31.5, lng: -60.7 } },
    idsDispositivo: [],
    capacidadDeCampo: 30,
    puntoMarchitez: 14,
    sueloConfirmadoPorUsuario: options.sueloConfirmadoPorUsuario,
    capacidadDeRiego: 8,
    eficienciaRiego: 85,
    anchoDeBulbo: 1,
    metrosLinealesHas: 10000,
    suelos: PROFUNDIDADES.map((profundidad, index) => ({
      numeroDeSensor: index + 1,
      profundidad,
      capacidadDeCampo: 30,
      puntoMarchitez: 14,
      hayRaices: true,
    })),
  };
  const siembrasService = {
    getById: jest.fn().mockResolvedValue({
      _id: 'siembra-1',
      idLote: 'lote-1',
      fechaSiembra: new Date(ahora - 7 * 24 * 60 * 60 * 1000).toISOString(),
      fechaCosecha: null,
      activa: true,
      semilla: { cultivo: 'Trigo' },
      lote,
    }),
    update: jest.fn().mockResolvedValue({}),
  };
  const lotesService = {
    getSoilAgronomicInputs: jest.fn().mockRejectedValue(new Error('sin perfil externo')),
    update: jest.fn().mockResolvedValue(lote),
  };
  const prediccionRiegoService = {
    create: jest.fn().mockResolvedValue({ _id: 'prediccion-1' }),
  };
  const dispositivosService = {
    get: jest.fn().mockResolvedValue({ datos: [{ _id: 'controlador-sentek' }] }),
  };
  const climaV2Service = {
    getLluviaMasCercanaEntreFechas: jest.fn().mockResolvedValue([
      {
        fecha: new Date(ahora - 2 * 60 * 60 * 1000).toISOString(),
        lluvia: { last: 0 },
      },
    ]),
    getSuelo: jest.fn().mockResolvedValue([
      {
        fecha: new Date(ahora - 60 * 60 * 1000).toISOString(),
        humedadSuelo: Object.fromEntries(
          PROFUNDIDADES.map((profundidad) => [profundidad, { last: 30 }]),
        ),
      },
    ]),
  };
  const httpsService = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new RiegoService(
    siembrasService as any,
    {} as any,
    lotesService as any,
    prediccionRiegoService as any,
    {} as any,
    httpsService as any,
    dispositivosService as any,
    climaV2Service as any,
    {} as any,
  );
  jest.spyOn(service, 'obtenerPronosticoConET0').mockResolvedValue(
    [0, 1, 2].map((dia) => ({
      fecha: new Date(ahora + dia * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      et0: 3,
      lluvia: 0,
      probabilidadLluvia: 0,
    })) as any,
  );

  return {
    service,
    siembrasService,
    prediccionRiegoService,
    httpsService,
  };
}
