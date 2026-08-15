import { of } from 'rxjs';
import { NapasService } from './service';

describe('NapasService - seguimiento seguro por lote', () => {
  const now = new Date('2026-08-15T18:45:00.000Z');
  const permiso = {
    nivel: 'Productor',
    rol: 'Lectura',
    idProductor: 'productor-1',
    modulos: { Sensores: true },
  } as any;

  const napaService = (
    idLote: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: 'nivel-napa',
    tipo: 'nivel_napa',
    nombre: 'Nivel de napa',
    sensores: ['Entrada Analógica', 'Napa'],
    habilitado: true,
    idProductor: 'productor-1',
    idEstablecimiento: 'establecimiento-1',
    idLote,
    fechaAsignacionLote: '2026-08-01T00:00:00.000Z',
    ...overrides,
  });

  const reporte = (
    nivelM: unknown,
    fecha = '2026-08-15T18:30:00.000Z',
    columnaAgua?: unknown,
  ) => {
    const columna =
      columnaAgua === undefined &&
      typeof nivelM === 'number' &&
      Number.isFinite(nivelM)
        ? Math.round((6 - nivelM) * 1000) / 1000
        : columnaAgua;
    return {
      fecha,
      fechaCreacion: fecha,
      datos: {
        valores: {
          Napa: [
            {
              unidad: 'm',
              valores: {
                actual: nivelM,
                columnaAgua: columna,
                profundidadInstalacion: 6,
              },
            },
          ],
        },
      },
      metadataLora: {
        fCnt: 256,
        cycleFirstFCnt: 250,
        payloadDecoderId: 'milesight-uc501-uc511',
        payloadDecoderVersion: '1.2.0',
        controllerManufacturer: 'Milesight',
        controllerModel: 'UC511',
      },
    };
  };

  const dispositivo = (id: string, servicios: any[], ultimoReporte: any) => ({
    _id: id,
    deveui: `DEV-${id}`,
    servicios,
    configuracionLecturas: {
      entradaAnalogica: {
        variable: 'nivel_napa',
        unidadSalida: 'm',
        profundidadInstalacionM: 6,
        versionConversion: 'lineal-4-20ma-v1',
      },
    },
    ultimoReporte,
  });

  const lote = (
    id: string,
    nombre: string,
    lat: number,
    lng: number,
    dispositivos: any[] = [],
    owner: Record<string, unknown> = {},
  ) => ({
    _id: id,
    nombre,
    idProductor: 'productor-1',
    idEstablecimiento: 'establecimiento-1',
    ubicacion: { centro: { lat, lng } },
    dispositivos,
    ...owner,
  });

  function subject(options: {
    lotes?: Record<string, any>;
    listedLots?: any[];
    sias?: any[];
  }) {
    const lotes = options.lotes || {};
    const loteService = {
      getById: jest.fn(async (id: string) => {
        if (!lotes[id]) throw new Error('lote no visible');
        return lotes[id];
      }),
      get: jest.fn(async () => ({
        datos: options.listedLots || Object.values(lotes),
        totalCount: (options.listedLots || Object.values(lotes)).length,
      })),
    };
    const http = {
      get: jest.fn(() =>
        of({
          data: options.sias || [
            {
              name: 'SIAS-1',
              codigoprovincial: 'SIAS-1',
              Provincia: 'Cordoba',
              Departamento: 'San Martin',
              fecha: '14-08-2026',
              NivelEstatico: '4.2',
              x: -62.19,
              y: -32.8,
              DuenioDelDato: 'Fuente publica',
            },
          ],
        }),
      ),
    };
    return {
      service: new NapasService(http as any, loteService as any),
      http,
      loteService,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prioriza la lectura propia exacta y no expone identificadores, payload ni coordenadas', async () => {
    const own = dispositivo(
      'device-own',
      [napaService('lote-1')],
      reporte(2.474),
    );
    const { service, http, loteService } = subject({
      lotes: {
        'lote-1': lote('lote-1', 'Lote 1', -32.8, -62.2, [own]),
      },
    });

    const result = await service.seguimientoLote('lote-1', permiso);

    expect(result).toEqual(
      expect.objectContaining({
        tipo: 'sensor_lote',
        nivelM: 2.474,
        columnaAguaM: 3.526,
        distanciaKm: 0,
        fechaMedicion: '2026-08-15T18:30:00.000Z',
      }),
    );
    expect((result as any).origen).toEqual(
      expect.objectContaining({
        fuente: 'Milesight/LoRaWAN',
        lote: 'Lote 1',
        fCnt: 250,
        decoderVersion: '1.2.0',
      }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('DEV-device-own');
    expect(serialized).not.toMatch(/payload|devEUI|deveui|lat|lng/i);
    expect(http.get).not.toHaveBeenCalled();
    expect(loteService.get).not.toHaveBeenCalled();
  });

  it('entrega la Napa propia a un permiso Tenant usando el lote ya autorizado y proyectado', async () => {
    const tenant = {
      nivel: 'Tenant',
      rol: 'Lectura',
      idTenant: 'tenant-1',
      modulos: { Sensores: true },
    } as any;
    const own = dispositivo(
      'device-own',
      [napaService('lote-1')],
      reporte(2.474),
    );
    const { service, loteService } = subject({
      lotes: {
        'lote-1': lote('lote-1', 'Lote 1', -32.8, -62.2, [own], {
          idTenant: 'tenant-1',
        }),
      },
    });

    const result = await service.seguimientoLote('lote-1', tenant);

    expect(result.tipo).toBe('sensor_lote');
    expect(result.nivelM).toBe(2.474);
    expect(loteService.getById).toHaveBeenCalledWith('lote-1', tenant);
  });

  it('limita tambien la referencia cercana Tenant a lotes autorizados', async () => {
    const tenant = {
      nivel: 'Tenant',
      rol: 'Lectura',
      idTenant: 'tenant-1',
      modulos: { Sensores: true },
    } as any;
    const near = dispositivo(
      'device-near',
      [napaService('lote-near')],
      reporte(2.553),
    );
    const { service, loteService } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2, [], {
          idTenant: 'tenant-1',
        }),
        'lote-near': lote('lote-near', 'Napa cercana', -32.79, -62.2, [near], {
          idTenant: 'tenant-1',
        }),
      },
    });

    const result = await service.seguimientoLote('target', tenant);

    expect(result.tipo).toBe('sensor_cercano');
    expect(result.nivelM).toBe(2.553);
    expect(loteService.get).toHaveBeenCalledWith(expect.any(Object), tenant);
    expect(loteService.getById).toHaveBeenCalledWith('lote-near', tenant);
  });

  it('usa el sensor visible mas cercano del mismo productor y establecimiento', async () => {
    const far = dispositivo(
      'device-far',
      [napaService('lote-far')],
      reporte(2.7),
    );
    const near = dispositivo(
      'device-near',
      [napaService('lote-near')],
      reporte(2.553),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2),
        'lote-far': lote('lote-far', 'Napa lejana', -32.5, -62.2, [far]),
        'lote-near': lote('lote-near', 'Napa cercana', -32.79, -62.2, [near]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sensor_cercano');
    expect(result).toEqual(
      expect.objectContaining({ nivelM: 2.553, distanciaKm: 1.11 }),
    );
    expect((result as any).origen.lote).toBe('Napa cercana');
    expect(result.mensaje).toContain('no es una medicion del lote');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('DEV-device-near');
    expect(serialized).not.toMatch(/"(?:devEUI|deveui|payload|lat|lng)"/i);
  });

  it('limita la referencia cercana a 10 km', async () => {
    const inside = dispositivo(
      'device-inside',
      [napaService('lote-inside')],
      reporte(2.4),
    );
    const outside = dispositivo(
      'device-outside',
      [napaService('lote-outside')],
      reporte(1.1),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2),
        'lote-inside': lote('lote-inside', 'Dentro del radio', -32.889, -62.2, [
          inside,
        ]),
        'lote-outside': lote(
          'lote-outside',
          'Fuera del radio',
          -32.891,
          -62.2,
          [outside],
        ),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sensor_cercano');
    expect(result).toEqual(expect.objectContaining({ nivelM: 2.4 }));
    expect((result as any).origen.lote).toBe('Dentro del radio');
    expect((result as any).distanciaKm).toBeLessThanOrEqual(10);
  });

  it('no usa como cercana una lectura demorada aunque este dentro del radio', async () => {
    const delayed = dispositivo(
      'device-delayed-nearby',
      [napaService('lote-near')],
      reporte(2.2, '2026-08-15T15:45:00.000Z'),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2),
        'lote-near': lote('lote-near', 'Napa cercana', -32.79, -62.2, [
          delayed,
        ]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sias');
  });

  it('bloquea fuentes de otro propietario aunque el inventario las incluya', async () => {
    const crossOwner = dispositivo(
      'device-cross',
      [napaService('lote-cross', { idProductor: 'productor-2' })],
      reporte(1.25),
    );
    const { service, loteService } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2),
        'lote-cross': lote(
          'lote-cross',
          'Otro productor',
          -32.79,
          -62.2,
          [crossOwner],
          { idProductor: 'productor-2' },
        ),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sias');
    expect(loteService.getById).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('device-cross');
    expect(serialized).not.toContain('-62.19');
    expect(serialized).not.toMatch(/"(?:devEUI|deveui|payload|lat|lng)"/i);
  });

  it('descarta lectura invalida y lectura vencida antes de recurrir a SIAS', async () => {
    const invalid = dispositivo(
      'device-invalid',
      [napaService('target')],
      reporte(7),
    );
    const stale = dispositivo(
      'device-stale',
      [napaService('target')],
      reporte(2.5, '2026-08-14T17:00:00.000Z'),
    );

    for (const projected of [invalid, stale]) {
      const { service } = subject({
        lotes: {
          target: lote('target', 'Objetivo', -32.8, -62.2, [projected]),
        },
      });
      const result = await service.seguimientoLote('target', permiso);
      expect(result.tipo).toBe('sias');
      expect(result.nivelM).toBe(4.2);
      expect(result.mensaje).toContain('no es una medicion del lote');
    }
  });

  it.each([null, '', undefined])(
    'no convierte el valor invalido %p en una napa de 0 m',
    async (valor) => {
      const invalid = dispositivo(
        'device-invalid',
        [napaService('target')],
        reporte(valor),
      );
      const { service } = subject({
        lotes: {
          target: lote('target', 'Objetivo', -32.8, -62.2, [invalid]),
        },
      });

      const result = await service.seguimientoLote('target', permiso);

      expect(result.tipo).toBe('sias');
      expect(result.nivelM).toBe(4.2);
    },
  );

  it('reconstruye la columna canonica cuando la publicada es nula', async () => {
    const own = dispositivo(
      'device-own',
      [napaService('target')],
      reporte(2.474, undefined, null as any),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2, [own]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sensor_lote');
    expect((result as any).columnaAguaM).toBe(3.526);
  });

  it('rechaza una columna publicada que contradice profundidad menos nivel por mas de 5 cm', async () => {
    const own = dispositivo(
      'device-own',
      [napaService('target')],
      reporte(2.474, undefined, 1),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2, [own]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sias');
  });

  it.each([undefined, 'fecha-invalida', '2026-08-16T00:00:00.000Z'])(
    'falla cerrado si la asignacion explicita es %p',
    async (fechaAsignacionLote) => {
      const own = dispositivo(
        'device-own',
        [napaService('target', { fechaAsignacionLote })],
        reporte(2.474),
      );
      const { service } = subject({
        lotes: {
          target: lote('target', 'Objetivo', -32.8, -62.2, [own]),
        },
      });

      const result = await service.seguimientoLote('target', permiso);

      expect(result.tipo).toBe('sias');
    },
  );

  it('usa timestamp y FCnt del inicio del ciclo aunque el reporte se cierre con una trama posterior', async () => {
    const mergedReport = reporte(2.474, '2026-08-15T18:40:00.000Z');
    (mergedReport.metadataLora as any).cycleFirstTimestamp =
      '2026-08-15T16:44:59.000Z';
    const own = dispositivo(
      'device-own',
      [napaService('target')],
      mergedReport,
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2, [own]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sensor_lote');
    expect((result as any).fechaMedicion).toBe('2026-08-15T16:44:59.000Z');
    expect((result as any).frescura).toBe('demorada');
    expect((result as any).origen.fCnt).toBe(250);
  });

  it.each([
    ['actual a las 2 horas exactas', '2026-08-15T16:45:00.000Z', 'actual'],
    ['demorada despues de 2 horas', '2026-08-15T16:44:59.000Z', 'demorada'],
    ['demorada a las 24 horas exactas', '2026-08-14T18:45:00.000Z', 'demorada'],
  ])('mantiene la lectura propia %s', async (_case, fecha, frescura) => {
    const own = dispositivo(
      'device-own',
      [napaService('target')],
      reporte(2.474, fecha),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2, [own]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sensor_lote');
    expect((result as any).frescura).toBe(frescura);
    if (frescura === 'demorada') {
      expect(result.mensaje).toContain('demorada');
    }
  });

  it('vence la lectura propia apenas supera las 24 horas', async () => {
    const own = dispositivo(
      'device-own',
      [napaService('target')],
      reporte(2.474, '2026-08-14T18:44:59.000Z'),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2, [own]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sias');
  });

  it('rechaza un servicio con el idLote correcto pero productor o establecimiento ajeno', async () => {
    const corrupt = dispositivo(
      'device-corrupt',
      [napaService('target', { idProductor: 'productor-2' })],
      reporte(2.1),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2, [corrupt]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sias');
  });

  it('no confunde la napa de otro servicio logico del mismo controlador con una medicion propia', async () => {
    const controller = dispositivo(
      'controller-shared',
      [
        {
          id: 'perfil-suelo-sentek',
          tipo: 'perfil_suelo',
          sensores: ['Humedad Suelo Profundidad'],
          idProductor: 'productor-1',
          idEstablecimiento: 'establecimiento-1',
          idLote: 'target',
        },
        napaService('otro-lote', { idProductor: 'productor-2' }),
      ],
      reporte(2.1),
    );
    const { service } = subject({
      lotes: {
        target: lote('target', 'Objetivo', -32.8, -62.2, [controller]),
      },
    });

    const result = await service.seguimientoLote('target', permiso);

    expect(result.tipo).toBe('sias');
    expect(result.mensaje).not.toContain('Medicion directa');
  });
});
