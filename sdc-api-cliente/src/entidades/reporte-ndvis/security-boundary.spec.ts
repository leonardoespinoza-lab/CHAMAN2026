import { NotFoundException } from '@nestjs/common';
import { ReporteNDVIsController } from './controller';
import { ReporteNDVIsService } from './service';

describe('Reporte NDVI - limite de procedencia y tenant', () => {
  function subject(report: Record<string, unknown>) {
    const repository = {
      getById: jest.fn().mockResolvedValue(report),
      getLastByScope: jest.fn().mockResolvedValue([]),
      getLastGlobal: jest.fn().mockResolvedValue([]),
    };
    return {
      service: new ReporteNDVIsService(repository as any),
      repository,
    };
  }

  it('no expone una escritura satelital manual en la API publica', () => {
    expect((ReporteNDVIsController.prototype as any).create).toBeUndefined();
    expect((ReporteNDVIsController.prototype as any).update).toBeUndefined();
  });

  it('no interpreta un reporte legacy sin tenant como visible para cualquier productor', async () => {
    const { service } = subject({
      _id: 'reporte-legacy',
      idLote: 'lote-1',
      ndviPromedio: 0.4,
    });

    await expect(
      service.getById('reporte-legacy', {
        nivel: 'Productor',
        rol: 'Lectura',
        idProductor: 'productor-ajeno',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('permite leer el reporte solamente cuando coincide el tenant', async () => {
    const report = {
      _id: 'reporte-1',
      idLote: 'lote-1',
      idProductor: 'productor-1',
      ndviPromedio: 0.4,
    };
    const { service } = subject(report);

    await expect(
      service.getById('reporte-1', {
        nivel: 'Productor',
        rol: 'Lectura',
        idProductor: 'productor-1',
      }),
    ).resolves.toBe(report);
  });

  it.each([
    [
      { nivel: 'Quimica', rol: 'Lectura', idQuimica: 'quimica-1' },
      'quimica',
      'quimica-1',
    ],
    [
      {
        nivel: 'Distribuidor',
        rol: 'Lectura',
        idDistribuidor: 'distribuidor-1',
      },
      'distribuidor',
      'distribuidor-1',
    ],
    [
      { nivel: 'Productor', rol: 'Lectura', idProductor: 'productor-1' },
      'productor',
      'productor-1',
    ],
    [
      {
        nivel: 'Establecimiento',
        rol: 'Lectura',
        idEstablecimiento: 'establecimiento-1',
        idProductor: 'productor-padre',
      },
      'establecimiento',
      'establecimiento-1',
    ],
  ])(
    'agrega ultimos NDVI solamente por el tenant activo %s',
    async (permiso, scope, id) => {
      const { service, repository } = subject({});

      await service.getLastByLote(permiso as any);

      expect(repository.getLastByScope).toHaveBeenCalledWith(scope, id);
    },
  );

  it('no amplía un permiso Establecimiento al Productor o Distribuidor padre', async () => {
    const { service, repository } = subject({});
    const permiso = {
      nivel: 'Establecimiento',
      rol: 'Lectura',
      idEstablecimiento: 'establecimiento-1',
      idProductor: 'productor-padre',
      idDistribuidor: 'distribuidor-padre',
    } as any;

    await service.getLastByLoteByIdDistribuidor(permiso);

    expect(repository.getLastByScope).toHaveBeenCalledWith(
      'establecimiento',
      'establecimiento-1',
    );
    expect(repository.getLastByScope).not.toHaveBeenCalledWith(
      'productor',
      'productor-padre',
    );
    expect(repository.getLastByScope).not.toHaveBeenCalledWith(
      'distribuidor',
      'distribuidor-padre',
    );
  });
});
