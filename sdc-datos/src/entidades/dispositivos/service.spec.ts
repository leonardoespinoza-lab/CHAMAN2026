import { BadRequestException } from '@nestjs/common';
import { ICreateDispositivo } from 'modelos/src';
import { DispositivosService } from './service';

describe('DispositivosService - calificacion meteorologica', () => {
  const qualification = {
    estado: 'calificado' as const,
    rolTemperatura: 'aire_2m' as const,
    alturaM: 2,
    abrigoRadiacion: true,
    exactitudTemperaturaC: 0.2,
    fechaCalibracion: '2026-06-01T12:00:00.000Z',
    proximaCalibracion: '2027-06-01T23:59:59.999Z',
    offsetTemperaturaC: 0,
    fuenteCalibracion: 'Certificado INTI 2026-14',
  };

  let repository: {
    create: jest.Mock;
    getById: jest.Mock;
    update: jest.Mock;
    syncFromLorawanCatalog: jest.Mock;
  };
  let service: DispositivosService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    repository = {
      create: jest.fn().mockImplementation(async (value) => value),
      getById: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockImplementation(async (_id, value) => value),
      syncFromLorawanCatalog: jest.fn().mockResolvedValue({
        total: 1,
        created: 1,
        updated: 0,
        unchanged: 0,
      }),
    };
    service = new DispositivosService(repository as any);
  });

  it('sincroniza el inventario ChirpStack sin aceptar lotes ilimitados', async () => {
    const items = [
      {
        devEUI: 'AABBCCDDEEFF0011',
        name: 'Controlador de campo',
        applicationID: 'app-1',
      },
    ];

    await expect(service.syncFromLorawanCatalog(items)).resolves.toEqual({
      total: 1,
      created: 1,
      updated: 0,
      unchanged: 0,
    });
    expect(repository.syncFromLorawanCatalog).toHaveBeenCalledWith(items);

    await expect(
      service.syncFromLorawanCatalog(new Array(5001).fill(items[0])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normaliza la napa como profundidad al agua referida al terreno', async () => {
    await service.create({
      deveui: '24E124454E358347',
      configuracionLecturas: {
        entradaAnalogica: {
          canal: 1,
          tipoSenal: '4-20mA',
          variable: 'nivel_napa',
          entradaMinMa: 4,
          entradaMaxMa: 20,
          salidaMin: 0,
          salidaMax: 10,
          unidadSalida: 'm',
          profundidadInstalacionM: 6,
          fuenteCalibracion: 'Ficha 0-10 m y medicion vertical en campo',
        },
      },
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        configuracionLecturas: expect.objectContaining({
          entradaAnalogica: expect.objectContaining({
            versionConversion: 'lineal-4-20ma-v1',
            magnitudSalida: 'columna_agua_sobre_sensor',
            referenciaProfundidad: 'nivel_terreno',
          }),
        }),
      }),
    );
  });

  it('rechaza declarar napa sin escala, datum y profundidad fisica completos', async () => {
    await expect(
      service.create({
        deveui: '24E124454E358347',
        configuracionLecturas: {
          entradaAnalogica: {
            canal: 1,
            tipoSenal: '4-20mA',
            variable: 'nivel_napa',
            entradaMinMa: 4,
            entradaMaxMa: 20,
            salidaMin: 0,
            salidaMax: 10,
            unidadSalida: 'mA',
          },
        },
      }),
    ).rejects.toThrow('configuracion del sensor analogico no es valida');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('no bloquea una actualizacion ajena a la entrada analogica de un dispositivo historico', async () => {
    await expect(
      service.update('legacy-device', { nombre: 'Controlador historico' }),
    ).resolves.toEqual({ nombre: 'Controlador historico' });

    expect(repository.getById).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith('legacy-device', {
      nombre: 'Controlador historico',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('acepta y persiste sin alterar una calificacion completa, incluido offset cero', async () => {
    const payload: ICreateDispositivo = {
      deveui: 'AABBCCDDEEFF0011',
      calificacionMeteorologica: qualification,
    };
    repository.create.mockResolvedValue(payload);

    await expect(service.create(payload)).resolves.toEqual(payload);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        deveui: payload.deveui,
        calificacionMeteorologica: expect.objectContaining({
          ...qualification,
          offsetTemperaturaC: 0,
          historialCalibraciones: [
            expect.objectContaining({
              variable: 'temperatura_aire',
              estado: 'calificado',
              offset: 0,
              fechaCalibracion: '2026-06-01T12:00:00.000Z',
              proximaCalibracion: '2027-06-01T23:59:59.999Z',
            }),
          ],
        }),
      }),
    );
  });

  it('rechaza declarar como calificado un sensor con metadatos incompletos', async () => {
    const payload: ICreateDispositivo = {
      deveui: 'AABBCCDDEEFF0022',
      calificacionMeteorologica: {
        estado: 'calificado',
        rolTemperatura: 'desconocido',
      },
    };

    await expect(service.create(payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rechaza una calibracion vencida al crear o actualizar', async () => {
    const payload: ICreateDispositivo = {
      deveui: 'AABBCCDDEEFF0033',
      calificacionMeteorologica: {
        ...qualification,
        proximaCalibracion: '2026-07-15',
      },
    };

    await expect(service.create(payload)).rejects.toThrow(
      'próxima calibración vigente',
    );
    await expect(service.update('device-1', payload)).rejects.toThrow(
      'próxima calibración vigente',
    );
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rechaza una fecha de calibracion futura aunque la vigencia termine despues', async () => {
    const payload: ICreateDispositivo = {
      deveui: 'AABBCCDDEEFF0044',
      calificacionMeteorologica: {
        ...qualification,
        fechaCalibracion: '2026-08-01',
        proximaCalibracion: '2027-08-01',
      },
    };

    await expect(service.create(payload)).rejects.toThrow(
      'fecha de calibración no futura',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('permite conservar como referencia una calibracion historica vencida', async () => {
    const payload: ICreateDispositivo = {
      deveui: 'AABBCCDDEEFF0055',
      calificacionMeteorologica: {
        ...qualification,
        estado: 'referencia',
        fechaCalibracion: '2025-01-01',
        proximaCalibracion: '2025-06-01',
      },
    };
    await expect(service.create(payload)).resolves.toEqual(
      expect.objectContaining({ deveui: payload.deveui }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        calificacionMeteorologica: expect.objectContaining({
          estado: 'referencia',
          historialCalibraciones: [
            expect.objectContaining({
              variable: 'temperatura_aire',
              estado: 'referencia',
            }),
          ],
        }),
      }),
    );
  });

  it('rechaza una fecha numerica cero para no persistir un epoch falso', async () => {
    const payload = {
      deveui: 'AABBCCDDEEFF0066',
      calificacionMeteorologica: {
        estado: 'referencia',
        fechaCalibracion: 0,
      },
    } as any;

    await expect(service.create(payload)).rejects.toThrow(
      'fecha de calibración válida',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('no certifica humedad cuando solo la temperatura esta calificada', async () => {
    const payload: ICreateDispositivo = {
      deveui: 'AABBCCDDEEFF0077',
      calificacionMeteorologica: qualification,
    };

    await service.create(payload);

    const stored = repository.create.mock.calls[0][0].calificacionMeteorologica;
    expect(stored.humedadRelativa).toBeUndefined();
    expect(stored.historialCalibraciones.map((item) => item.variable)).toEqual([
      'temperatura_aire',
    ]);
  });

  it('valida y registra una calibracion propia para humedad relativa', async () => {
    const payload: ICreateDispositivo = {
      deveui: 'AABBCCDDEEFF0088',
      calificacionMeteorologica: {
        estado: 'referencia',
        humedadRelativa: {
          estado: 'calificado',
          rol: 'aire_2m',
          alturaM: 2,
          abrigoRadiacion: true,
          exactitud: 2.5,
          fechaCalibracion: '2026-06-01T12:00:00.000Z',
          proximaCalibracion: '2027-06-01T23:59:59.999Z',
          offset: 0,
          fuenteCalibracion: 'Patron de humedad RH-2026-8',
        },
      },
    };

    await service.create(payload);

    const stored = repository.create.mock.calls[0][0].calificacionMeteorologica;
    expect(stored.humedadRelativa.offset).toBe(0);
    expect(stored.historialCalibraciones).toEqual([
      expect.objectContaining({
        variable: 'humedad_relativa',
        estado: 'calificado',
        exactitud: 2.5,
        offset: 0,
      }),
    ]);
  });

  it('conserva intervalos anteriores y descarta un historial inyectado por el cliente', async () => {
    const initial = (await service.create({
      deveui: 'AABBCCDDEEFF0099',
      calificacionMeteorologica: {
        ...qualification,
        proximaCalibracion: '2026-07-31T23:59:59.999Z',
      },
    })) as any;
    repository.getById.mockResolvedValue(initial);

    const updated = await service.update('device-1', {
      calificacionMeteorologica: {
        ...qualification,
        fechaCalibracion: '2026-07-16T12:00:00.000Z',
        proximaCalibracion: '2027-07-16T23:59:59.999Z',
        offsetTemperaturaC: -0.4,
        fuenteCalibracion: 'Certificado de recalibracion 2026-77',
        historialCalibraciones: [
          {
            id: 'inyectado',
            variable: 'temperatura_aire',
            version: 'calificacion-variable-v1',
            registradoEn: '1900-01-01T00:00:00.000Z',
            estado: 'calificado',
            fechaCalibracion: '1900-01-01T00:00:00.000Z',
            proximaCalibracion: '2100-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    const history = updated.calificacionMeteorologica.historialCalibraciones;
    expect(history).toHaveLength(2);
    expect(history.map((item) => item.id)).not.toContain('inyectado');
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variable: 'temperatura_aire',
          offset: 0,
          fechaCalibracion: '2026-06-01T12:00:00.000Z',
          proximaCalibracion: '2026-07-31T23:59:59.999Z',
        }),
        expect.objectContaining({
          variable: 'temperatura_aire',
          offset: -0.4,
          fechaCalibracion: '2026-07-16T12:00:00.000Z',
          proximaCalibracion: '2027-07-16T23:59:59.999Z',
        }),
      ]),
    );
  });

  it('impide reescribir metadatos de una ventana historica ya registrada', async () => {
    const initial = (await service.create({
      deveui: 'AABBCCDDEEFF0100',
      calificacionMeteorologica: qualification,
    })) as any;
    repository.getById.mockResolvedValue(initial);

    await expect(
      service.update('device-1', {
        calificacionMeteorologica: {
          ...qualification,
          offsetTemperaturaC: 1.2,
        },
      }),
    ).rejects.toThrow('no puede reescribirse');
    expect(repository.update).not.toHaveBeenCalled();
  });
});
