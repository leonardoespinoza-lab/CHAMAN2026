import { LoteService } from './lote.service';

describe('LoteService soil assessment requests', () => {
  let http: {
    get: jasmine.Spy;
    post: jasmine.Spy;
    put: jasmine.Spy;
  };
  let service: LoteService;

  beforeEach(() => {
    http = {
      get: jasmine.createSpy('get'),
      post: jasmine.createSpy('post'),
      put: jasmine.createSpy('put'),
    };
    service = new LoteService(http as any);
  });

  it('coalesces concurrent reads and caches a terminal assessment', async () => {
    const assessment = { status: 'ready', summary: {} } as any;
    http.get.and.resolveTo(assessment);

    const first = service.sueloAmbiente('lot-1');
    const second = service.sueloAmbiente('lot-1');

    expect(second).toBe(first);
    expect(http.get).toHaveBeenCalledTimes(1);
    await expectAsync(first).toBeResolvedTo(assessment);
    await expectAsync(service.sueloAmbiente('lot-1')).toBeResolvedTo(assessment);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('does not let an invalidated request overwrite or clear a newer one', async () => {
    const oldRequest = deferred<any>();
    const newRequest = deferred<any>();
    http.get.and.returnValues(oldRequest.promise, newRequest.promise);
    http.put.and.resolveTo({ _id: 'lot-1' });

    const oldRead = service.sueloAmbiente('lot-1');
    await service.editar('lot-1', {} as any);
    const newRead = service.sueloAmbiente('lot-1');

    oldRequest.resolve({ status: 'ready', summary: { estimatedTexture: 'Arcilloso' } });
    await oldRead;
    expect(service.sueloAmbiente('lot-1')).toBe(newRead);

    const current = { status: 'ready', summary: { estimatedTexture: 'Franco' } } as any;
    newRequest.resolve(current);
    await expectAsync(newRead).toBeResolvedTo(current);
    await expectAsync(service.sueloAmbiente('lot-1')).toBeResolvedTo(current);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('invalidates the read cache before an explicit reprocess', async () => {
    const assessment = { status: 'ready', summary: {} } as any;
    http.get.and.resolveTo(assessment);
    http.post.and.resolveTo({ status: 'pending' });

    await service.sueloAmbiente('lot-1');
    await service.reprocesarSueloAmbiente('lot-1');
    await service.sueloAmbiente('lot-1');

    expect(http.get).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
