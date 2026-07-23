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
    expect(pipeline[0].$match).toEqual(
      expect.objectContaining({
        idEstablecimiento: expect.anything(),
        'metadataImagen.renderVersion': 'fixed-index-v3',
        'metadataImagen.renderQa.ndvi.status': 'ok',
      }),
    );
    expect(pipeline).toContainEqual({
      $group: {
        _id: '$idLote',
        lastReporte: { $last: '$$ROOT' },
      },
    });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('excluye del mapa escenas con cobertura operativa menor al 50%', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const aggregate = jest.fn().mockReturnValue({ exec });
    const repository = new ReporteNDVIsRepository({ aggregate } as any);

    await repository.getLastByIdProductor('507f1f77bcf86cd799439011');

    const match = aggregate.mock.calls[0][0][0].$match;
    expect(match.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          'metadataImagen.renderQa.ndvi.validCoveragePct': { $gte: 50 },
        }),
      ]),
    );
  });
});
