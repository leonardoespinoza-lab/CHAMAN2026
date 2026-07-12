import { WebsocketService } from './websocket.service';

describe('WebsocketService tenant scope', () => {
  function socket(id: string, permisos: any[]) {
    return {
      usuario: { _id: id, username: id, permisos },
      send: jest.fn(),
    } as any;
  }

  it('entrega eventos solo al tenant correspondiente y a administradores', () => {
    const service = new WebsocketService({} as any);
    const admin = socket('admin', [{ nivel: 'Admin' }]);
    const productor = socket('productor-a', [
      { nivel: 'Productor', idProductor: 'productor-a' },
    ]);
    const otro = socket('productor-b', [
      { nivel: 'Productor', idProductor: 'productor-b' },
    ]);
    service.setServer({ clients: new Set([admin, productor, otro]) } as any);

    expect(
      service.getSesionesPorAlcance({ idProductor: 'productor-a' }),
    ).toEqual([admin, productor]);
  });

  it('usa id de usuario solo cuando no hay alcance tenant', () => {
    const service = new WebsocketService({} as any);
    const objetivo = socket('usuario-a', []);
    const otro = socket('usuario-b', []);
    service.setServer({ clients: new Set([objetivo, otro]) } as any);

    expect(service.getSesionesPorAlcance(undefined, 'usuario-a')).toEqual([
      objetivo,
    ]);
  });
});
