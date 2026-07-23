import { MqttInterceptor } from '../../auxiliares/mqtt/mqtt.interceptor';
import { LotesService } from './service';

describe('LotesService - transferencia de establecimiento', () => {
  function subject(idAsesorPropietario?: string) {
    const repository = {
      update: jest.fn().mockImplementation(async (id, data) => ({
        _id: id,
        idEstablecimiento: 'establecimiento-nuevo',
        ...data,
      })),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const establecimientosService = {
      getById: jest.fn().mockResolvedValue({
        _id: 'establecimiento-nuevo',
        idTenant: 'tenant-nuevo',
        idAsesorPropietario,
        idProductor: 'productor-nuevo',
        idDistribuidor: 'distribuidor-nuevo',
        idQuimica: 'quimica-nueva',
      }),
    };
    const queue = {
      enqueueForLot: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new LotesService(
      repository as any,
      establecimientosService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      queue as any,
    );
    jest.spyOn(service, 'getById').mockResolvedValue({
      _id: 'lote-1',
      idTenant: 'tenant-anterior',
      idAsesorPropietario: 'asesor-anterior',
      idProductor: 'productor-anterior',
      idEstablecimiento: 'establecimiento-anterior',
    } as any);

    return { service, repository };
  }

  function eventScope(lote: unknown) {
    const interceptor = new MqttInterceptor({} as any);
    return (interceptor as any).resolverAlcance('lotes', lote, {
      nivel: 'Admin',
      rol: 'Admin',
    });
  }

  it('reemplaza el asesor propietario y publica el evento solo con el alcance nuevo', async () => {
    const { service, repository } = subject('asesor-nuevo');

    const updated = await service.update(
      'lote-1',
      { idEstablecimiento: 'establecimiento-nuevo' } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'lote-1',
      expect.objectContaining({
        idEstablecimiento: 'establecimiento-nuevo',
        idTenant: 'tenant-nuevo',
        idAsesorPropietario: 'asesor-nuevo',
        idProductor: 'productor-nuevo',
        idDistribuidor: 'distribuidor-nuevo',
        idQuimica: 'quimica-nueva',
      }),
    );
    expect(eventScope(updated)).toEqual(
      expect.objectContaining({
        idTenant: 'tenant-nuevo',
        idAsesorPropietario: 'asesor-nuevo',
        idEstablecimiento: 'establecimiento-nuevo',
        idLote: 'lote-1',
      }),
    );
    expect(eventScope(updated).idAsesorPropietario).not.toBe('asesor-anterior');
    expect(
      (service as any).puedeVer(updated, {
        nivel: 'Asesor',
        rol: 'Lectura',
        idAsesor: 'asesor-anterior',
        idEstablecimientos: ['establecimiento-anterior'],
      }),
    ).toBe(false);
  });

  it('limpia el asesor propietario cuando el establecimiento nuevo no tiene uno', async () => {
    const { service, repository } = subject();

    const updated = await service.update(
      'lote-1',
      { idEstablecimiento: 'establecimiento-nuevo' } as any,
      { nivel: 'Admin', rol: 'Admin' },
    );

    expect(repository.update.mock.calls[0][1]).toEqual(
      expect.objectContaining({ idAsesorPropietario: null }),
    );
    expect(updated.idAsesorPropietario).toBeNull();
    expect(eventScope(updated).idAsesorPropietario).toBeUndefined();
  });
});
