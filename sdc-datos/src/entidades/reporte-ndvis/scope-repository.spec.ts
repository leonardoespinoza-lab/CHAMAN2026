import { ReporteNDVIsRepository } from './repository';

describe('ReporteNDVIsRepository - agregacion por tenant', () => {
  it('aplica el campo de establecimiento antes de agrupar por lote', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const aggregate = jest.fn().mockReturnValue({ exec });
    const repository = new ReporteNDVIsRepository({ aggregate } as any);

    await repository.getLastByScope(
      'establecimiento',
      '507f1f77bcf86cd799439011',
    );

    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({
      $match: {
        idEstablecimiento: expect.anything(),
      },
    });
    expect(pipeline).toContainEqual({
      $group: {
        _id: '$idLote',
        lastReporte: { $last: '$$ROOT' },
      },
    });
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
