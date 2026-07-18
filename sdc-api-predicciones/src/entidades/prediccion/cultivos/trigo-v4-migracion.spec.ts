import { IPrediccion, TRIGO_MOTOR_SANITARIO_VERSION } from 'modelos/src';

jest.mock(
  'src/entidades/fumigacion/service',
  () => ({ FumigacionsService: class FumigacionsService {} }),
  { virtual: true },
);

import { PrediccionTrigoService } from './trigo';

describe('migracion del motor sanitario de trigo v4', () => {
  const crearService = () =>
    new PrediccionTrigoService(
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
    );

  const siembra = {
    fechaSiembra: '2026-05-05T03:00:00.000Z',
  } as any;
  const crono = {
    etapas: {
      R0_R1: 7,
      R1_R2: 20,
      R2_R3: 20,
      R3_R4: 20,
      R4_R5: 20,
      R5_R6: 20,
      R6_R7: 20,
    },
  } as any;

  it('reconstruye desde emergencia cuando la ultima prediccion es v3', () => {
    const service = crearService() as any;
    const prediccionV3 = {
      fecha: '2026-07-14T03:00:00.000Z',
      enfermedades: [
        {
          modelo: { version: 3 },
          variables: { GDDBase0Siembra: 999, coberturaGdd: 1 },
        },
      ],
    } as IPrediccion;

    const persistida = service.getAcumulacionGddPersistida(
      prediccionV3,
      new Date(siembra.fechaSiembra),
    );
    const fecha = service.getFechaDesdeMotorVigente(
      siembra,
      crono,
      prediccionV3,
      Boolean(persistida),
    );

    expect(persistida).toBeUndefined();
    expect(fecha.toISOString()).toBe('2026-05-12T03:00:00.000Z');
  });

  it('continua al dia siguiente cuando ya existe contexto v4', () => {
    const service = crearService() as any;
    const prediccionV4 = {
      fecha: '2026-07-14T03:00:00.000Z',
      enfermedades: [
        {
          modelo: { version: TRIGO_MOTOR_SANITARIO_VERSION },
          variables: { GDDBase0Siembra: 778, coberturaGdd: 0.95 },
        },
      ],
    } as IPrediccion;

    const persistida = service.getAcumulacionGddPersistida(
      prediccionV4,
      new Date(siembra.fechaSiembra),
    );
    const fecha = service.getFechaDesdeMotorVigente(
      siembra,
      crono,
      prediccionV4,
      Boolean(persistida),
    );

    expect(persistida).toEqual({
      gdd: 778,
      diasEsperados: 71,
      diasDisponibles: 67,
    });
    expect(fecha.toISOString()).toBe('2026-07-15T03:00:00.000Z');
  });

  it('usa un limite diario independiente del crono y de la etapa calendario', () => {
    const service = crearService() as any;
    jest
      .spyOn(service, 'diaActual')
      .mockReturnValue(new Date('2027-01-01T00:00:00.000Z'));

    expect(service.getFechaHasta(siembra, crono).toISOString()).toBe(
      '2027-01-02T03:00:00.000Z',
    );
  });
});
