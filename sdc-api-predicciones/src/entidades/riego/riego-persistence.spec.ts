import { RiegoService } from './service';

const PROFUNDIDADES = Array.from(
  { length: 12 },
  (_, index) => (index + 1) * 10,
);

describe('RiegoService - invalidacion segura de persistencia', () => {
  it('el circuito interno calcula sin enviar integraciones', async () => {
    const c = crearContexto({ sueloConfirmadoPorUsuario: true });
    const enviar = jest.spyOn(c.service as any, 'verificarIntegraciones');
    await expect(
      c.service.prediccion('siembra-1', false, { propagarErrores: true }),
    ).resolves.toBeUndefined();
    expect(c.prediccionRiegoService.create).toHaveBeenCalledTimes(1);
    expect(enviar).not.toHaveBeenCalled();
    expect(c.httpsService.send).not.toHaveBeenCalled();
  });

  it('un bloqueo agronomico valido no es un fallo tecnico del pipeline', async () => {
    const c = crearContexto({ sueloConfirmadoPorUsuario: false });
    await expect(
      c.service.prediccion('siembra-1', false, { propagarErrores: true }),
    ).resolves.toBeUndefined();
    expect(c.prediccionRiegoService.create).not.toHaveBeenCalled();
    expect(c.siembrasService.update).toHaveBeenCalledTimes(1);
  });

  it.each(['dependencia', 'persistencia', 'invalidacion', 'fuente', 'siembra'])(
    'propaga %s fallida solo al circuito interno',
    async (caso) => {
      const c = crearContexto({
        sueloConfirmadoPorUsuario: caso !== 'invalidacion',
      });
      const error = new Error(`fallo ${caso}`);
      if (caso === 'dependencia')
        jest
          .spyOn(c.service as any, 'resolverLoteConEntradasAgronomicas')
          .mockRejectedValue(error);
      if (caso === 'persistencia')
        c.prediccionRiegoService.create.mockRejectedValue(error);
      if (caso === 'invalidacion')
        c.siembrasService.update.mockRejectedValue(error);
      if (caso === 'fuente')
        jest
          .spyOn(c.service, 'obtenerPronosticoConET0')
          .mockRejectedValue(error);
      if (caso === 'siembra')
        c.siembrasService.getById.mockRejectedValue(error);
      await expect(
        c.service.prediccion('siembra-1', false, { propagarErrores: true }),
      ).rejects.toThrow();
      expect(c.httpsService.send).not.toHaveBeenCalled();
    },
  );

  it('espera la escritura tardia antes de invalidar el resultado parcial', async () => {
    const c = crearContexto({ sueloConfirmadoPorUsuario: true });
    let terminarEscritura!: () => void;
    let escrituraIniciada!: () => void;
    const iniciada = new Promise<void>((resolve) => {
      escrituraIniciada = resolve;
    });
    c.siembrasService.update.mockImplementationOnce(() => {
      escrituraIniciada();
      return new Promise((resolve) => {
        terminarEscritura = () => resolve({});
      });
    });
    c.prediccionRiegoService.create.mockRejectedValue(
      new Error('fallo parcial'),
    );
    const rejection = expect(
      c.service.prediccion('siembra-1', false, { propagarErrores: true }),
    ).rejects.toThrow('fallo parcial');
    await iniciada;
    expect(c.siembrasService.update).toHaveBeenCalledTimes(1);
    terminarEscritura();
    await rejection;
    expect(c.siembrasService.update).toHaveBeenCalledTimes(2);
    expect(c.siembrasService.update).toHaveBeenLastCalledWith(
      'siembra-1',
      expect.objectContaining({
        ultimaPrediccionRiego: [],
        estadoRecomendacionRiego: 'no_disponible',
        motivoRecomendacionRiego: expect.stringContaining(
          'fallo la persistencia',
        ),
      }),
    );
  });

  it('el fallo de invalidacion tras una dependencia tampoco se informa como exito', async () => {
    const c = crearContexto({ sueloConfirmadoPorUsuario: true });
    jest
      .spyOn(c.service as any, 'resolverLoteConEntradasAgronomicas')
      .mockRejectedValue(new Error('dependencia'));
    c.siembrasService.update.mockRejectedValue(new Error('BD no disponible'));
    await expect(
      c.service.prediccion('siembra-1', false, { propagarErrores: true }),
    ).rejects.toThrow('dependencia');
  });

  it.each([true, false])(
    'conserva el calculo y respeta enviarIntegraciones=%s',
    async (enviarIntegraciones) => {
      const contexto = crearContexto({ sueloConfirmadoPorUsuario: true });
      const enviar = jest
        .spyOn(contexto.service as any, 'verificarIntegraciones')
        .mockResolvedValue(undefined);

      await contexto.service.prediccion('siembra-1', enviarIntegraciones);

      expect(contexto.prediccionRiegoService.create).toHaveBeenCalledTimes(1);
      expect(enviar).toHaveBeenCalledTimes(enviarIntegraciones ? 1 : 0);
      expect(contexto.httpsService.send).not.toHaveBeenCalled();
    },
  );

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
    expect(
      contexto.siembrasService.update.mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
    expect(contexto.siembrasService.update).toHaveBeenLastCalledWith(
      'siembra-1',
      expect.objectContaining({
        ultimaPrediccionRiego: [],
        aguaUtilReal: null,
        estadoCalculoAguaUtil: 'no_disponible',
        estadoRecomendacionRiego: 'no_disponible',
        fuenteRecomendacionRiego: null,
        motivoRecomendacionRiego: expect.stringContaining(
          'fallo la persistencia',
        ),
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
    getSoilAgronomicInputs: jest
      .fn()
      .mockRejectedValue(new Error('sin perfil externo')),
    update: jest.fn().mockResolvedValue(lote),
  };
  const prediccionRiegoService = {
    create: jest.fn().mockResolvedValue({ _id: 'prediccion-1' }),
  };
  const dispositivosService = {
    get: jest
      .fn()
      .mockResolvedValue({ datos: [{ _id: 'controlador-sentek' }] }),
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
