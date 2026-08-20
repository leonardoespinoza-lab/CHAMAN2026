import { ForbiddenException } from '@nestjs/common';
import { DispositivosService } from '../dispositivos/service';
import { ReportesService } from './service';

describe('ReportesService - aislamiento por servicio lógico', () => {
  const devEUI = '24E124454E358347';
  const dispositivo: any = {
    _id: 'controlador-compartido',
    deveui: devEUI,
    sensores: [
      'Humedad Suelo Profundidad',
      'Temperatura Suelo',
      'Salinidad Suelo',
      'Entrada Analógica',
      'Presión',
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
        sensores: ['Entrada Analógica', 'Presión', 'Napa'],
        idProductor: 'productor-b',
        idLote: 'lote-b',
      },
    ],
  };
  const reporte: any = {
    _id: 'reporte-1',
    idDispositivo: dispositivo._id,
    deveui: devEUI,
    fechaCreacion: '2026-08-15T09:00:00.000Z',
    fecha: '2026-08-15T09:00:00.000Z',
    estado: 'completo',
    payloadHex: 'no-debe-salir',
    decodedObject: { suelo: [21], napa: 2.5 },
    datos: {
      valores: {
        'Humedad Suelo Profundidad': [
          { profundidad: 10, unidad: '%', valores: { actual: 21 } },
        ],
        'Temperatura Suelo': [
          { profundidad: 10, unidad: 'C', valores: { actual: 17 } },
        ],
        'Salinidad Suelo': [
          { profundidad: 10, unidad: 'VIC', valores: { actual: 1800 } },
        ],
        'Entrada Analógica': [{ unidad: 'mA', valores: { actual: 9.2 } }],
        Presión: [{ unidad: 'm', valores: { actual: 3.5 } }],
        Napa: [{ unidad: 'm', valores: { actual: 2.5 } }],
        Batería: [{ unidad: '%', valores: { actual: 96 } }],
      },
    },
    metadataLora: {
      ubicacionGW: { type: 'Point', coordinates: [-60, -30] },
      tenantID: 'tenant-secreto',
      applicationID: 'app-secreta',
      chirpstackApplicationName: 'cliente-privado',
      payloadDecoderId: 'milesight-uc50x',
      profileChannels: [0, 1, 2, 12],
      cycleFirstFCnt: 80,
      cycleLastFCnt: 90,
      fCnt: 90,
      fPort: 85,
      rssi: -90,
      snr: 8,
      frequency: 923300000,
      dr: 3,
    },
    dispositivo: { ...dispositivo, secretoInterno: 'no' },
  };

  function setup(device: any = dispositivo, report: any = reporte) {
    const deviceRepository = {
      getById: jest.fn().mockResolvedValue(device),
      get: jest.fn().mockResolvedValue({ datos: [device], totalCount: 1 }),
    };
    const dispositivos = new DispositivosService(deviceRepository as any);
    const repository = {
      getById: jest.fn().mockResolvedValue(report),
      get: jest.fn().mockResolvedValue({ datos: [report], totalCount: 1 }),
      historico: jest
        .fn()
        .mockResolvedValue({ datos: [report], totalCount: 1 }),
    };
    return {
      repository,
      service: new ReportesService(repository as any, dispositivos),
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

  const nombresSensores = (result: any): string[] =>
    Object.keys(result.datos.valores);

  it('proyecta getById y su populate para el servicio A', async () => {
    const { service } = setup();

    const response: any = await service.getById(
      'reporte-1',
      usuario('productor-a'),
    );

    expect(nombresSensores(response)).toEqual([
      'Humedad Suelo Profundidad',
      'Temperatura Suelo',
      'Salinidad Suelo',
      'Batería',
    ]);
    expect(response.dispositivo.servicios.map((item: any) => item.id)).toEqual([
      'perfil-suelo-sentek',
    ]);
    expect(response.dispositivo.idProductor).toBeUndefined();
    expect(response.dispositivo).not.toHaveProperty('secretoInterno');
    expect(response.dispositivo).not.toHaveProperty('metadata');
    expect(response.dispositivo).not.toHaveProperty('ultimoReporte');
    expect(response).not.toHaveProperty('payloadHex');
    expect(response).not.toHaveProperty('decodedObject');
    expect(response.metadataLora).toEqual({
      frequency: 923300000,
      fCnt: 90,
      fPort: 85,
      snr: 8,
      rssi: -90,
      dr: 3,
    });
  });

  it('proyecta get, histórico y diario para el servicio B', async () => {
    const { service } = setup();
    const user = usuario('productor-b');

    const listado: any = await service.get(
      { filter: JSON.stringify({ idDispositivo: dispositivo._id }) },
      user,
    );
    const historico: any = await service.historico(
      dispositivo._id,
      7,
      100,
      user,
    );
    const diario: any = await service.diario(7, dispositivo._id, user);

    for (const response of [listado, historico, diario]) {
      expect(response.totalCount).toBe(1);
      expect(nombresSensores(response.datos[0])).toEqual([
        'Entrada Analógica',
        'Presión',
        'Napa',
        'Batería',
      ]);
      expect(
        response.datos[0].datos.valores['Humedad Suelo Profundidad'],
      ).toBeUndefined();
      expect(response.datos[0].metadataLora).not.toHaveProperty(
        'profileChannels',
      );
    }
  });

  it('conserva el histórico ambiental de una estación legacy asignada a un lote', async () => {
    const device: any = {
      _id: 'sensor-kleppe-1',
      deveui: '24E124433F027440',
      tipo: 'Estacion Meteorologica',
      idProductor: 'productor-kleppe',
      idEstablecimiento: 'establecimiento-kleppe',
      idLote: 'cuadro-7-la-costa',
      sensores: ['Temperatura', 'Humedad', 'Batería', 'Otro'],
      servicios: [],
    };
    const report: any = {
      _id: 'reporte-kleppe-1',
      idDispositivo: device._id,
      deveui: device.deveui,
      fechaCreacion: '2026-08-20T10:57:48.010Z',
      fecha: '2026-08-20T10:57:48.010Z',
      estado: 'completo',
      datos: {
        valores: {
          Temperatura: [{ unidad: 'C', valores: { actual: 4.5 } }],
          Humedad: [{ unidad: '%', valores: { actual: 71 } }],
          Batería: [{ unidad: '%', valores: { actual: 96 } }],
        },
      },
      dispositivo: device,
    };
    const { service } = setup(device, report);

    const historico: any = await service.historico(
      device._id,
      1,
      100,
      usuario('productor-kleppe'),
    );

    expect(nombresSensores(historico.datos[0])).toEqual([
      'Temperatura',
      'Humedad',
      'Batería',
    ]);
    expect(
      historico.datos[0].datos.valores.Temperatura[0].valores.actual,
    ).toBe(4.5);
    expect(historico.datos[0].datos.valores.Humedad[0].valores.actual).toBe(
      71,
    );
  });

  it('no deja que un filtro OR incorpore reportes de otro dispositivo autorizado solo por tipo de sensor', async () => {
    const { service, repository } = setup();
    const reporteAjeno: any = {
      ...reporte,
      _id: 'reporte-ajeno',
      idDispositivo: 'controlador-ajeno',
      deveui: '24E124454E000999',
      datos: {
        valores: {
          'Humedad Suelo Profundidad': [
            { profundidad: 10, unidad: '%', valores: { actual: 99 } },
          ],
        },
      },
    };
    repository.get.mockResolvedValueOnce({
      datos: [reporte, reporteAjeno],
      totalCount: 2,
    });

    const response: any = await service.get(
      {
        filter: JSON.stringify({
          $or: [
            { idDispositivo: dispositivo._id },
            { idDispositivo: reporteAjeno.idDispositivo },
          ],
        }),
      },
      usuario('productor-a'),
    );

    expect(response.totalCount).toBe(1);
    expect(response.datos.map((item: any) => item._id)).toEqual(['reporte-1']);
    expect(
      response.datos[0].datos.valores['Humedad Suelo Profundidad'][0].valores
        .actual,
    ).toBe(21);
  });

  it('un usuario con acceso A+B conserva todas las variables sin metadatos cruzados', async () => {
    const { service } = setup();
    const user: any = {
      permisos: [
        { nivel: 'Productor', idProductor: 'productor-a' },
        { nivel: 'Productor', idProductor: 'productor-b' },
      ],
    };

    const response: any = await service.getById('reporte-1', user);

    expect(nombresSensores(response)).toHaveLength(7);
    expect(response.dispositivo.servicios).toHaveLength(2);
    expect(response.metadataLora).not.toHaveProperty('applicationID');
  });

  it('omite un sensor agregado compartido por perfiles ocultos A/B', async () => {
    const device: any = {
      _id: 'controlador-dos-perfiles',
      deveui: devEUI,
      sensores: ['Humedad Suelo Profundidad', 'Batería'],
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
    const report: any = {
      ...reporte,
      idDispositivo: device._id,
      dispositivo: device,
      datos: {
        valores: {
          'Humedad Suelo Profundidad': [
            { profundidad: 10, unidad: '%', valores: { actual: 77 } },
          ],
          Batería: [{ unidad: '%', valores: { actual: 95 } }],
        },
      },
    };
    const { service } = setup(device, report);

    const responseA: any = await service.getById(
      'reporte-1',
      usuario('productor-a'),
    );
    const responseB: any = await service.getById(
      'reporte-1',
      usuario('productor-b'),
    );
    const responseAmbos: any = await service.getById('reporte-1', {
      permisos: [
        { nivel: 'Productor', idProductor: 'productor-a' },
        { nivel: 'Productor', idProductor: 'productor-b' },
      ],
    } as any);

    expect(nombresSensores(responseA)).toEqual(['Batería']);
    expect(nombresSensores(responseB)).toEqual(['Batería']);
    expect(nombresSensores(responseAmbos)).toEqual([
      'Humedad Suelo Profundidad',
      'Batería',
    ]);
  });

  it('Admin conserva el reporte interno completo', async () => {
    const { service } = setup();
    const admin: any = {
      permisos: [{ nivel: 'Admin', roles: ['Admin'] }],
    };

    const response = await service.getById('reporte-1', admin);
    const historico = await service.historico(dispositivo._id, 7, 100, admin);

    expect(response).toBe(reporte);
    expect(historico.datos[0]).toBe(reporte);
    expect((response as any).payloadHex).toBe('no-debe-salir');
    expect((response as any).metadataLora.profileChannels).toEqual([
      0, 1, 2, 12,
    ]);
  });

  it('rechaza módulo Sensores deshabilitado antes de leer reportes', async () => {
    const { service, repository } = setup();

    await expect(
      service.historico(dispositivo._id, 7, 100, usuario('productor-a', false)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.historico).not.toHaveBeenCalled();
  });

  it('rechaza getById sin idDispositivo ni devEUI para no omitir la autorización', async () => {
    const { service, repository } = setup();
    repository.getById.mockResolvedValueOnce({ _id: 'reporte-huerfano' });

    await expect(
      service.getById('reporte-huerfano', usuario('productor-a')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
