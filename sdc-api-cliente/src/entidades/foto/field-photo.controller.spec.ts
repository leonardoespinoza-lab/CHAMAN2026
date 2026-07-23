import { FotosController, imageContentType } from './controller';

describe('FotosController - entrega binaria', () => {
  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg'],
    [
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/png',
    ],
    [
      Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      ]),
      'image/webp',
    ],
  ])('detecta la firma real y publica %s como %s', (image, expected) => {
    expect(imageContentType(image)).toBe(expected);
  });

  it('envia el Buffer sin serializarlo como JSON', async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const service = {
      getImagen: jest.fn().mockResolvedValue(image),
    };
    const response = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
    const controller = new FotosController(service as any);

    await controller.getImage(
      'foto-1',
      { nivel: 'Productor', rol: 'Lectura', idProductor: 'productor-1' },
      response as any,
    );

    expect(service.getImagen).toHaveBeenCalledWith(
      'foto-1',
      expect.objectContaining({ idProductor: 'productor-1' }),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/jpeg',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '4');
    expect(response.send).toHaveBeenCalledWith(image);
  });
});
