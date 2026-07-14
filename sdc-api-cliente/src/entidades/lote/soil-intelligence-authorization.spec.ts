import { BadRequestException } from '@nestjs/common';
import { LotesService } from './service';

describe('LotesService - autorizacion de suelo y ambiente', () => {
  const createService = () => {
    const repository = {
      getById: jest.fn(),
      getAdministrativeLocation: jest.fn(),
      getSoilIntelligence: jest.fn(),
      reprocessSoilIntelligence: jest.fn(),
    };
    const service = new LotesService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { repository, service };
  };

  const permisoProductor = {
    nivel: 'Productor',
    idProductor: 'productor-1',
  } as any;

  it('consulta suelo sin enriquecer la ubicacion administrativa', async () => {
    const { repository, service } = createService();
    const assessment = { loteId: 'lote-1', status: 'ready' };
    repository.getById.mockResolvedValue({
      _id: 'lote-1',
      idProductor: 'productor-1',
    });
    repository.getSoilIntelligence.mockResolvedValue(assessment);

    await expect(
      service.getSoilIntelligence('lote-1', permisoProductor),
    ).resolves.toBe(assessment);

    expect(repository.getById).toHaveBeenCalledTimes(1);
    expect(repository.getAdministrativeLocation).not.toHaveBeenCalled();
    expect(repository.getSoilIntelligence).toHaveBeenCalledWith('lote-1');
  });

  it('reprocesa suelo sin enriquecer la ubicacion administrativa', async () => {
    const { repository, service } = createService();
    const assessment = { loteId: 'lote-1', status: 'processing' };
    repository.getById.mockResolvedValue({
      _id: 'lote-1',
      idProductor: 'productor-1',
    });
    repository.reprocessSoilIntelligence.mockResolvedValue(assessment);

    await expect(
      service.reprocessSoilIntelligence('lote-1', permisoProductor),
    ).resolves.toBe(assessment);

    expect(repository.getById).toHaveBeenCalledTimes(1);
    expect(repository.getAdministrativeLocation).not.toHaveBeenCalled();
    expect(repository.reprocessSoilIntelligence).toHaveBeenCalledWith('lote-1');
  });

  it('mantiene el enriquecimiento administrativo en getById', async () => {
    const { repository, service } = createService();
    const lote = { _id: 'lote-1', idProductor: 'productor-1' };
    const ubicacion = { provincia: 'Buenos Aires' };
    repository.getById.mockResolvedValue(lote);
    repository.getAdministrativeLocation.mockResolvedValue(ubicacion);

    await expect(service.getById('lote-1', permisoProductor)).resolves.toEqual({
      ...lote,
      ubicacionAdministrativa: ubicacion,
    });

    expect(repository.getAdministrativeLocation).toHaveBeenCalledWith('lote-1');
  });

  it('rechaza permisos ajenos antes de consultar o reprocesar suelo', async () => {
    const { repository, service } = createService();
    repository.getById.mockResolvedValue({
      _id: 'lote-1',
      idProductor: 'otro-productor',
    });

    await expect(
      service.getSoilIntelligence('lote-1', permisoProductor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reprocessSoilIntelligence('lote-1', permisoProductor),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.getAdministrativeLocation).not.toHaveBeenCalled();
    expect(repository.getSoilIntelligence).not.toHaveBeenCalled();
    expect(repository.reprocessSoilIntelligence).not.toHaveBeenCalled();
  });
});
