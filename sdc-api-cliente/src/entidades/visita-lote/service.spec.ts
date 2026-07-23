import { BadRequestException } from '@nestjs/common';
import { VisitasLoteService } from './service';

describe('VisitasLoteService', () => {
  function subject() {
    const repository = {
      get: jest.fn().mockResolvedValue({ datos: [], totalCount: 0 }),
      getById: jest.fn(),
      getFotosByIds: jest.fn().mockResolvedValue({
        datos: [],
        totalCount: 0,
      }),
      create: jest.fn((data) => Promise.resolve({ _id: 'visita-1', ...data })),
      update: jest.fn((id, data) => Promise.resolve({ _id: id, ...data })),
    };
    const lotesService = {
      getById: jest.fn().mockResolvedValue({
        _id: 'lote-1',
        idTenant: 'tenant-canonico',
        idProductor: 'productor-canonico',
        idEstablecimiento: 'establecimiento-canonico',
      }),
    };
    return {
      service: new VisitasLoteService(repository as any, lotesService as any),
      repository,
      lotesService,
    };
  }

  const permiso = { nivel: 'Productor', rol: 'Escritura', idProductor: 'productor-canonico' } as any;
  const user = { _id: 'usuario-1', username: 'asesor.campo' } as any;

  it('deriva el alcance organizacional del lote y no del payload', async () => {
    const { service, repository } = subject();

    await service.create(
      {
        idLote: 'lote-1',
        fechaVisita: '2026-07-22T12:00:00.000Z',
        titulo: 'Recorrida semanal',
        idTenant: 'tenant-inyectado',
        idProductor: 'productor-inyectado',
      } as any,
      permiso,
      user,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idLote: 'lote-1',
        idTenant: 'tenant-canonico',
        idProductor: 'productor-canonico',
        creadaPorUsuario: 'usuario-1',
      }),
    );
  });

  it('valida el lote antes de listar sus visitas', async () => {
    const { service, repository, lotesService } = subject();
    lotesService.getById.mockRejectedValue(new Error('lote fuera de alcance'));

    await expect(service.getByLote('lote-ajeno', permiso)).rejects.toThrow('lote fuera de alcance');
    expect(repository.get).not.toHaveBeenCalled();
  });

  it('respeta la deshabilitacion del modulo en el tenant', async () => {
    const { service, lotesService } = subject();

    await expect(
      service.getByLote('lote-1', {
        ...permiso,
        modulos: { Visitas: false },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(lotesService.getById).not.toHaveBeenCalled();
  });

  it('archiva sin borrar la trazabilidad', async () => {
    const { service, repository } = subject();
    repository.getById.mockResolvedValue({ _id: 'visita-1', idLote: 'lote-1' });

    await service.archive('visita-1', permiso, user);

    expect(repository.update).toHaveBeenCalledWith(
      'visita-1',
      expect.objectContaining({ archivado: true, motivoArchivado: expect.any(String) }),
    );
  });

  it('actualiza como patch sin reiniciar los campos y arrays omitidos', async () => {
    const { service, repository } = subject();
    repository.getById.mockResolvedValue({
      _id: 'visita-1',
      idLote: 'lote-1',
      titulo: 'Recorrida original',
      tipo: 'monitoreo_sanitario',
      estado: 'programada',
      actividades: ['fotografias', 'fenologia'],
      participantes: ['Ing. Agronoma'],
      idsFotos: ['foto-existente'],
    });

    await service.update(
      'visita-1',
      { observaciones: '  Seguimiento sin novedades.  ' },
      permiso,
      user,
    );

    const patch = repository.update.mock.calls[0][1];
    expect(patch).toEqual(
      expect.objectContaining({
        observaciones: 'Seguimiento sin novedades.',
        actualizadoPorUsuario: 'usuario-1',
      }),
    );
    expect(Object.keys(patch).sort()).toEqual(
      [
        'actualizadoPorNombre',
        'actualizadoPorUsuario',
        'fechaActualizacion',
        'observaciones',
      ].sort(),
    );
  });

  it('permite vaciar explicitamente los arrays editables', async () => {
    const { service, repository } = subject();
    repository.getById.mockResolvedValue({
      _id: 'visita-1',
      idLote: 'lote-1',
      actividades: ['fotografias'],
      participantes: ['Asesor'],
      idsFotos: ['foto-1'],
    });

    await service.update(
      'visita-1',
      { actividades: [], participantes: [], idsFotos: [] },
      permiso,
      user,
    );

    expect(repository.update).toHaveBeenCalledWith(
      'visita-1',
      expect.objectContaining({
        actividades: [],
        participantes: [],
        idsFotos: [],
      }),
    );
    expect(repository.getFotosByIds).not.toHaveBeenCalled();
  });

  it('asocia solo fotos existentes del mismo lote autorizado', async () => {
    const { service, repository, lotesService } = subject();
    repository.getById.mockResolvedValue({
      _id: 'visita-1',
      idLote: 'lote-1',
    });
    repository.getFotosByIds.mockResolvedValue({
      datos: [
        { _id: 'foto-1', idLote: 'lote-1' },
        { _id: 'foto-2', idLote: 'lote-1' },
      ],
      totalCount: 2,
    });

    await service.update(
      'visita-1',
      { idsFotos: ['foto-1', 'foto-2', 'foto-1'] },
      permiso,
      user,
    );

    expect(lotesService.getById).toHaveBeenCalledWith('lote-1', permiso);
    expect(repository.getFotosByIds).toHaveBeenCalledWith([
      'foto-1',
      'foto-2',
    ]);
    expect(repository.update).toHaveBeenCalledWith(
      'visita-1',
      expect.objectContaining({ idsFotos: ['foto-1', 'foto-2'] }),
    );
  });

  it('rechaza una foto perteneciente a otro lote', async () => {
    const { service, repository } = subject();
    repository.getById.mockResolvedValue({
      _id: 'visita-1',
      idLote: 'lote-1',
    });
    repository.getFotosByIds.mockResolvedValue({
      datos: [{ _id: 'foto-ajena', idLote: 'lote-2' }],
      totalCount: 1,
    });

    await expect(
      service.update(
        'visita-1',
        { idsFotos: ['foto-ajena'] },
        permiso,
        user,
      ),
    ).rejects.toThrow('mismo lote');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rechaza fotos inexistentes o archivadas antes de actualizar', async () => {
    const { service, repository } = subject();
    repository.getById.mockResolvedValue({
      _id: 'visita-1',
      idLote: 'lote-1',
    });
    repository.getFotosByIds.mockResolvedValue({
      datos: [{ _id: 'foto-1', idLote: 'lote-1' }],
      totalCount: 1,
    });

    await expect(
      service.update(
        'visita-1',
        { idsFotos: ['foto-1', 'foto-inexistente'] },
        permiso,
        user,
      ),
    ).rejects.toThrow('deben existir');
    expect(repository.update).not.toHaveBeenCalled();
  });
});
