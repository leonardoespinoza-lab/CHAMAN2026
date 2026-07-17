import { TRIGO_MOTOR_SANITARIO_VERSION } from 'modelos/src';
import { SiembrasService } from './service';

describe('SiembrasService - actualizacion sanitaria de trigo', () => {
  function setup(
    ultimaPrediccion?: Record<string, unknown>,
    cultivo = 'Trigo',
  ) {
    const siembra = {
      _id: 'siembra-1',
      idLote: 'lote-1',
      idProductor: 'productor-1',
      semilla: { cultivo },
      ultimaPrediccion,
    } as any;
    const repository = {
      getById: jest.fn().mockResolvedValue(siembra),
    };
    const predicciones = {
      prediccion: jest.fn().mockResolvedValue([{ fuente: 'incremental' }]),
      reconstruir: jest.fn().mockResolvedValue([{ fuente: 'reconstruida' }]),
    };
    const lotes = {
      getById: jest.fn().mockResolvedValue({
        _id: 'lote-1',
        idProductor: 'productor-1',
      }),
    };
    const service = new SiembrasService(
      repository as any,
      predicciones as any,
      {} as any,
      {} as any,
      lotes as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, predicciones };
  }

  const permiso = {
    nivel: 'Productor',
    rol: 'Escritura',
    idProductor: 'productor-1',
  } as any;

  it('reconstruye de forma transaccional cuando la lectura de trigo es anterior a v5', async () => {
    const { service, predicciones } = setup({
      enfermedades: [
        { modelo: { version: TRIGO_MOTOR_SANITARIO_VERSION - 1 } },
      ],
    });

    await service.generarPrediccionEnfermedades('siembra-1', permiso);

    expect(predicciones.reconstruir).toHaveBeenCalledWith('siembra-1', permiso);
    expect(predicciones.prediccion).not.toHaveBeenCalled();
  });

  it('continua incrementalmente cuando toda la lectura de trigo ya es v5', async () => {
    const { service, predicciones } = setup({
      enfermedades: [
        { modelo: { version: TRIGO_MOTOR_SANITARIO_VERSION } },
        { modelo: { version: TRIGO_MOTOR_SANITARIO_VERSION } },
      ],
    });

    await service.generarPrediccionEnfermedades('siembra-1', permiso);

    expect(predicciones.prediccion).toHaveBeenCalledWith('siembra-1');
    expect(predicciones.reconstruir).not.toHaveBeenCalled();
  });

  it('no aplica una migracion de trigo a los demas cultivos', async () => {
    const { service, predicciones } = setup(
      { enfermedades: [{ modelo: { version: 1 } }] },
      'Cebada',
    );

    await service.generarPrediccionEnfermedades('siembra-1', permiso);

    expect(predicciones.prediccion).toHaveBeenCalledWith('siembra-1');
    expect(predicciones.reconstruir).not.toHaveBeenCalled();
  });
});
