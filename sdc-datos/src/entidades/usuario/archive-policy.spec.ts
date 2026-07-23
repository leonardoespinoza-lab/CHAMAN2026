import { UsuariosRepository } from './repository';

describe('UsuariosRepository - politica de archivado', () => {
  it('desactiva y archiva sin ejecutar borrado fisico', async () => {
    const lean = jest.fn().mockResolvedValue({
      _id: 'asesor-1',
      activo: false,
      archivado: true,
    });
    const select = jest.fn().mockReturnValue({ lean });
    const model: any = {
      findByIdAndUpdate: jest.fn().mockReturnValue({ select }),
      findByIdAndDelete: jest.fn(),
    };
    const repository = new UsuariosRepository(model);

    const result = await repository.delete('asesor-1', {
      archivadoPor: 'admin',
      motivoArchivado: 'Prueba controlada',
    });

    expect(model.findByIdAndDelete).not.toHaveBeenCalled();
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'asesor-1',
      expect.objectContaining({
        activo: false,
        archivado: true,
        archivadoPor: 'admin',
        motivoArchivado: 'Prueba controlada',
        fechaArchivado: expect.any(Date),
      }),
      { new: true },
    );
    expect(result).toMatchObject({ activo: false, archivado: true });
  });
});
