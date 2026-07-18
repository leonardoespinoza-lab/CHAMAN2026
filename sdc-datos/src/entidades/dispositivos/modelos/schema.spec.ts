import mongoose from 'mongoose';
import { DispositivoSchema } from './schema';

describe('DispositivoSchema - calificacion meteorologica', () => {
  const modelName = 'DispositivoCalificacionMeteorologicaSpec';
  const Model =
    mongoose.models[modelName] ||
    mongoose.model(modelName, DispositivoSchema.clone());

  afterAll(() => {
    mongoose.deleteModel(modelName);
  });

  it('castea fechas y conserva offset cero en una calificacion completa', () => {
    const document = new Model({
      deveui: 'AABBCCDDEEFF0011',
      calificacionMeteorologica: {
        estado: 'calificado',
        rolTemperatura: 'aire_2m',
        alturaM: 2,
        abrigoRadiacion: true,
        exactitudTemperaturaC: 0.2,
        fechaCalibracion: '2026-06-01T12:00:00.000Z',
        proximaCalibracion: '2027-06-01T23:59:59.999Z',
        offsetTemperaturaC: 0,
        fuenteCalibracion: '  Certificado trazable  ',
      },
    });

    expect(document.validateSync()).toBeUndefined();
    const stored = (document as any).calificacionMeteorologica;
    expect(stored.fechaCalibracion).toBeInstanceOf(Date);
    expect(stored.proximaCalibracion).toBeInstanceOf(Date);
    expect(stored.offsetTemperaturaC).toBe(0);
    expect(stored.fuenteCalibracion).toBe('Certificado trazable');
  });

  it('rechaza estados, roles y rangos fuera del contrato aun en referencias', () => {
    const document = new Model({
      deveui: 'AABBCCDDEEFF0022',
      calificacionMeteorologica: {
        estado: 'supuesto',
        rolTemperatura: 'aire_50m',
        alturaM: 50,
        exactitudTemperaturaC: 5,
        offsetTemperaturaC: 99,
      },
    });

    const error = document.validateSync();

    expect(error).toBeDefined();
    expect(Object.keys(error?.errors || {})).toEqual(
      expect.arrayContaining([
        'calificacionMeteorologica.estado',
        'calificacionMeteorologica.rolTemperatura',
        'calificacionMeteorologica.alturaM',
        'calificacionMeteorologica.exactitudTemperaturaC',
        'calificacionMeteorologica.offsetTemperaturaC',
      ]),
    );
  });

  it('castea por separado la humedad y los intervalos historicos trazables', () => {
    const document = new Model({
      deveui: 'AABBCCDDEEFF0033',
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
          fuenteCalibracion: ' Patron RH trazable ',
        },
        historialCalibraciones: [
          {
            id: 'cal-rh-1',
            variable: 'humedad_relativa',
            version: 'calificacion-variable-v1',
            registradoEn: '2026-07-16T12:00:00.000Z',
            estado: 'calificado',
            rol: 'aire_2m',
            alturaM: 2,
            abrigoRadiacion: true,
            exactitud: 2.5,
            fechaCalibracion: '2026-06-01T12:00:00.000Z',
            proximaCalibracion: '2027-06-01T23:59:59.999Z',
            offset: 0,
            fuenteCalibracion: ' Patron RH trazable ',
          },
        ],
      },
    });

    expect(document.validateSync()).toBeUndefined();
    const qualification = (document as any).calificacionMeteorologica;
    expect(qualification.humedadRelativa.fechaCalibracion).toBeInstanceOf(Date);
    expect(qualification.humedadRelativa.offset).toBe(0);
    expect(qualification.humedadRelativa.fuenteCalibracion).toBe(
      'Patron RH trazable',
    );
    expect(qualification.historialCalibraciones[0].registradoEn).toBeInstanceOf(
      Date,
    );
    expect(
      qualification.historialCalibraciones[0].fechaCalibracion,
    ).toBeInstanceOf(Date);
  });

  it('aplica limites especificos a humedad y a intervalos historicos de temperatura', () => {
    const document = new Model({
      deveui: 'AABBCCDDEEFF0044',
      calificacionMeteorologica: {
        estado: 'referencia',
        humedadRelativa: {
          estado: 'referencia',
          exactitud: 7,
          offset: 25,
        },
        historialCalibraciones: [
          {
            id: 'cal-temp-invalida',
            variable: 'temperatura_aire',
            version: 'calificacion-variable-v1',
            registradoEn: '2026-07-16T12:00:00.000Z',
            estado: 'referencia',
            exactitud: 3,
            offset: 11,
          },
        ],
      },
    });

    const error = document.validateSync();

    expect(error).toBeDefined();
    expect(Object.keys(error?.errors || {})).toEqual(
      expect.arrayContaining([
        'calificacionMeteorologica.humedadRelativa.exactitud',
        'calificacionMeteorologica.humedadRelativa.offset',
        'calificacionMeteorologica.historialCalibraciones.0.exactitud',
        'calificacionMeteorologica.historialCalibraciones.0.offset',
      ]),
    );
  });
});
