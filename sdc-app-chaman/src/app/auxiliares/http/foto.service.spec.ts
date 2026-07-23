import { FotoService } from './foto.service';

describe('FotoService', () => {
  it('descarga la imagen por id como blob a traves del endpoint autenticado', async () => {
    const blob = new Blob(['imagen'], { type: 'image/jpeg' });
    const http = {
      get: jasmine.createSpy('get').and.resolveTo(blob),
    };
    const service = new FotoService(http as any);

    await expectAsync(service.getImagen('foto-1')).toBeResolvedTo(blob);
    expect(http.get).toHaveBeenCalledWith('/fotos/imagen', {
      params: { id: 'foto-1' },
      responseType: 'blob',
    });
  });
});
