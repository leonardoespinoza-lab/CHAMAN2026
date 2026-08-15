import { ForbiddenException } from '@nestjs/common';
import { DispositivosService } from '../dispositivos/service';
import { LorawanUplinksService } from './service';

describe('LorawanUplinksService - aislamiento por servicio lógico', () => {
  const devEUI = '24E124454E358347';
  const dispositivo: any = {
    _id: 'controlador-compartido',
    deveui: devEUI,
    sensores: [
      'Humedad Suelo Profundidad',
      'Temperatura Suelo',
      'Salinidad Suelo',
      'Entrada Analógica',
      'Napa',
      'Batería',
    ],
    servicios: [
      {
        id: 'perfil-suelo-sentek',
        tipo: 'perfil_suelo',
        nombre: 'Sentek A',
        sensores: [
          'Humedad Suelo Profundidad',
          'Temperatura Suelo',
          'Salinidad Suelo',
        ],
        idProductor: 'productor-a',
        idLote: 'lote-a',
      },
      {
        id: 'nivel-napa',
        tipo: 'nivel_napa',
        nombre: 'Napa B',
        sensores: ['Entrada Analógica', 'Napa'],
        idProductor: 'productor-b',
        idLote: 'lote-b',
      },
    ],
  };

  const frames: any[] = [
    {
      id: 'frame-mixto',
      devEUI,
      timestamp: '2026-08-15T10:00:00.000Z',
      fCnt: 100,
      fPort: 85,
      gatewayID: 'gateway-1',
      rssi: -91,
      snr: 7,
      frequency: 923300000,
      dr: 3,
      payloadHex: '01020304',
      payloadBase64: 'AQIDBA==',
      decodedObject: { perfil: [22], napa: 2.5 },
      rawPayload: { secreto: true },
      profileChannels: [0, 1, 2, 12],
      decoderId: 'milesight-uc50x',
      decoderVersion: '1.2.3',
      controllerModel: 'UC501',
      decodeStatus: 'decoded',
      readings: [
        {
          serviceId: 'perfil-suelo-sentek',
          variable: 'humedad_suelo',
          value: 22,
          unit: '%',
          depthCm: 10,
          secretDecodedSibling: { napa: 2.5 },
        },
        {
          serviceId: 'perfil-suelo-sentek',
          variable: 'temperatura_suelo',
          value: 18,
          unit: 'C',
          depthCm: 10,
        },
        {
          serviceId: 'entrada-analogica',
          variable: 'corriente_analogica',
          value: 9.2,
          unit: 'mA',
        },
        {
          serviceId: 'nivel-napa',
          variable: 'nivel_napa',
          value: 2.5,
          unit: 'm',
          waterColumnM: 3.5,
          installationDepthM: 6,
        },
      ],
    },
    {
      id: 'frame-solo-napa',
      devEUI,
      timestamp: '2026-08-15T10:15:00.000Z',
      decodeStatus: 'decoded',
      payloadHex: '05060708',
      readings: [
        {
          serviceId: 'nivel-napa',
          variable: 'nivel_napa',
          value: 2.52,
          unit: 'm',
        },
      ],
    },
  ];

  function setup(device: any = dispositivo, rawFrames: any[] = frames) {
    const deviceRepository = {
      get: jest.fn().mockResolvedValue({ datos: [device], totalCount: 1 }),
      getById: jest.fn().mockResolvedValue(device),
    };
    const dispositivos = new DispositivosService(deviceRepository as any);
    const repository = {
      rawHistory: jest.fn().mockResolvedValue(rawFrames),
    };
    return {
      repository,
      service: new LorawanUplinksService(repository as any, dispositivos),
    };
  }

  const usuario = (idProductor: string, sensores = true): any => ({
    permisos: [
      {
        nivel: 'Productor',
        idProductor,
        modulos: { Sensores: sensores },
      },
    ],
  });

  it('A recibe sólo perfil y no recibe payload ni metadatos reconstruibles', async () => {
    const { service } = setup();

    const response: any[] = await service.rawHistory(
      devEUI,
      7,
      100,
      usuario('productor-a'),
    );

    expect(response.map((frame) => frame.id)).toEqual(['frame-mixto']);
    expect(response[0].readings.map((row: any) => row.variable)).toEqual([
      'humedad_suelo',
      'temperatura_suelo',
    ]);
    expect(response[0]).toMatchObject({
      devEUI,
      fCnt: 100,
      gatewayID: 'gateway-1',
    });
    for (const campo of [
      'payloadHex',
      'payloadBase64',
      'decodedObject',
      'rawPayload',
      'profileChannels',
      'decoderId',
      'decoderVersion',
      'controllerModel',
    ]) {
      expect(response[0]).not.toHaveProperty(campo);
    }
    expect(response[0].readings[0]).not.toHaveProperty('secretDecodedSibling');
  });

  it('B recibe sólo la lectura atribuida a napa, aun cuando comparten trama', async () => {
    const { service } = setup();

    const response: any[] = await service.rawHistory(
      devEUI,
      7,
      100,
      usuario('productor-b'),
    );

    expect(response.map((frame) => frame.id)).toEqual([
      'frame-mixto',
      'frame-solo-napa',
    ]);
    expect(response[0].readings.map((row: any) => row.variable)).toEqual([
      'nivel_napa',
    ]);
    expect(
      response
        .flatMap((frame) => frame.readings)
        .some((row: any) => row.variable === 'humedad_suelo'),
    ).toBe(false);
  });

  it('un usuario que ve ambos servicios conserva las lecturas atribuidas, pero no el payload', async () => {
    const { service } = setup();
    const user: any = {
      permisos: [
        { nivel: 'Productor', idProductor: 'productor-a' },
        { nivel: 'Productor', idProductor: 'productor-b' },
      ],
    };

    const response: any[] = await service.rawHistory(devEUI, 7, 100, user);

    // `entrada-analogica` no existe como servicio en el inventario; al traer
    // serviceId no se infiere por variable ni siquiera para A+B.
    expect(response[0].readings).toHaveLength(3);
    expect(response[0]).not.toHaveProperty('payloadHex');
  });

  it('usa serviceId antes que variable para dos perfiles de suelo con propietarios A/B', async () => {
    const device: any = {
      _id: 'controlador-dos-perfiles',
      deveui: devEUI,
      sensores: ['Humedad Suelo Profundidad'],
      servicios: [
        {
          id: 'perfil-a',
          tipo: 'perfil_suelo',
          nombre: 'Perfil A',
          sensores: ['Humedad Suelo Profundidad'],
          idProductor: 'productor-a',
          idLote: 'lote-a',
        },
        {
          id: 'perfil-b',
          tipo: 'perfil_suelo',
          nombre: 'Perfil B',
          sensores: ['Humedad Suelo Profundidad'],
          idProductor: 'productor-b',
          idLote: 'lote-b',
        },
      ],
    };
    const rawFrames: any[] = [
      {
        id: 'frame-perfiles-a-b',
        devEUI,
        timestamp: '2026-08-15T11:00:00.000Z',
        decodeStatus: 'decoded',
        readings: [
          {
            serviceId: 'perfil-a',
            variable: 'humedad_suelo',
            value: 11,
            unit: '%',
            depthCm: 10,
          },
          {
            serviceId: 'perfil-b',
            variable: 'humedad_suelo',
            value: 33,
            unit: '%',
            depthCm: 10,
          },
        ],
      },
    ];
    const { service } = setup(device, rawFrames);

    const responseA: any[] = await service.rawHistory(
      devEUI,
      7,
      100,
      usuario('productor-a'),
    );
    const responseB: any[] = await service.rawHistory(
      devEUI,
      7,
      100,
      usuario('productor-b'),
    );

    expect(responseA[0].readings.map((row: any) => row.value)).toEqual([11]);
    expect(responseB[0].readings.map((row: any) => row.value)).toEqual([33]);
  });

  it('Admin conserva la trama cruda completa sin proyección', async () => {
    const { service } = setup();

    const response = await service.rawHistory(devEUI, 7, 100, {
      permisos: [{ nivel: 'Admin', roles: ['Admin'] }],
    } as any);

    expect(response).toBe(frames);
    expect((response[0] as any).payloadHex).toBe('01020304');
    expect((response[0] as any).decodedObject.napa).toBe(2.5);
  });

  it('respeta la denegación explícita del módulo Sensores antes de consultar datos', async () => {
    const { service, repository } = setup();

    await expect(
      service.rawHistory(devEUI, 7, 100, usuario('productor-a', false)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.rawHistory).not.toHaveBeenCalled();
  });
});
