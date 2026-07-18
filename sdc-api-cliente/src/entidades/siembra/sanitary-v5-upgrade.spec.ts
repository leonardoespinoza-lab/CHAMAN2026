import {
  ARVEJA_MOTOR_SANITARIO_VERSION,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
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
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
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
    return { service, predicciones, repository };
  }

  const permiso = {
    nivel: 'Productor',
    rol: 'Escritura',
    idProductor: 'productor-1',
  } as any;

  it('sincroniza clima y reconstruye de forma transaccional cuando la lectura de trigo es anterior a v5', async () => {
    const { service, predicciones, repository } = setup({
      enfermedades: [
        { modelo: { version: TRIGO_MOTOR_SANITARIO_VERSION - 1 } },
      ],
    });

    await service.generarPrediccionEnfermedades('siembra-1', permiso);

    expect(repository.reprocesarAgrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      true,
    );
    expect(predicciones.reconstruir).toHaveBeenCalledWith('siembra-1', permiso);
    expect(predicciones.prediccion).not.toHaveBeenCalled();
  });

  it('reconstruye tambien una lectura v5 para no conservar el mismo dia con clima o fenologia obsoletos', async () => {
    const { service, predicciones, repository } = setup({
      enfermedades: [
        { modelo: { version: TRIGO_MOTOR_SANITARIO_VERSION } },
        { modelo: { version: TRIGO_MOTOR_SANITARIO_VERSION } },
      ],
    });

    await service.generarPrediccionEnfermedades('siembra-1', permiso);

    expect(repository.reprocesarAgrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      true,
    );
    expect(predicciones.reconstruir).toHaveBeenCalledWith('siembra-1', permiso);
    expect(predicciones.prediccion).not.toHaveBeenCalled();
  });

  it('actualiza clima y reconstruye los demas cultivos sin aplicarles una version de trigo', async () => {
    const { service, predicciones, repository } = setup(
      { enfermedades: [{ modelo: { version: 1 } }] },
      'Cebada',
    );

    await service.generarPrediccionEnfermedades('siembra-1', permiso);

    expect(repository.reprocesarAgrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      true,
    );
    expect(predicciones.reconstruir).toHaveBeenCalledWith('siembra-1', permiso);
    expect(predicciones.prediccion).not.toHaveBeenCalled();
  });

  it('reconstruye Arveja cuando el screening materializado es anterior a v2', async () => {
    const { service, predicciones } = setup(
      {
        enfermedades: [
          { modelo: { version: ARVEJA_MOTOR_SANITARIO_VERSION - 1 } },
        ],
      },
      'Arveja',
    );

    await service.generarPrediccionEnfermedades('siembra-1', permiso);

    expect(predicciones.reconstruir).toHaveBeenCalledWith('siembra-1', permiso);
    expect(predicciones.prediccion).not.toHaveBeenCalled();
  });

  it('reconstruye Arveja v2 luego de refrescar el clima canonico', async () => {
    const { service, predicciones, repository } = setup(
      {
        enfermedades: [{ modelo: { version: ARVEJA_MOTOR_SANITARIO_VERSION } }],
      },
      'Arveja',
    );

    await service.generarPrediccionEnfermedades('siembra-1', permiso);

    expect(repository.reprocesarAgrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      true,
    );
    expect(predicciones.reconstruir).toHaveBeenCalledWith('siembra-1', permiso);
    expect(predicciones.prediccion).not.toHaveBeenCalled();
  });

  it('no reconstruye si falla la sincronizacion climatica que debe precederla', async () => {
    const { service, predicciones, repository } = setup(
      {
        enfermedades: [{ modelo: { version: ARVEJA_MOTOR_SANITARIO_VERSION } }],
      },
      'Arveja',
    );
    repository.reprocesarAgrometeorologia.mockRejectedValueOnce(
      new Error('clima-no-disponible'),
    );

    await expect(
      service.generarPrediccionEnfermedades('siembra-1', permiso),
    ).rejects.toThrow('clima-no-disponible');

    expect(predicciones.reconstruir).not.toHaveBeenCalled();
    expect(predicciones.prediccion).not.toHaveBeenCalled();
  });
});
