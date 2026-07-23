import { WebsocketService } from './websocket.service';
import { EventsGateway } from './events.gateway';

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

  it('aísla los eventos entre tenants por idTenant', () => {
    const service = new WebsocketService({} as any);
    const tenantA = socket('tenant-a-admin', [
      { nivel: 'Tenant', idTenant: 'tenant-a' },
    ]);
    const tenantB = socket('tenant-b-admin', [
      { nivel: 'Tenant', idTenant: 'tenant-b' },
    ]);
    service.setServer({ clients: new Set([tenantA, tenantB]) } as any);

    expect(
      service.getSesionesPorAlcance({
        idTenant: 'tenant-a',
        idProductor: 'productor-a',
      }),
    ).toEqual([tenantA]);
  });

  it('no entrega a Tenant eventos sin idTenant explícito', () => {
    const service = new WebsocketService({} as any);
    const tenantA = socket('tenant-a-admin', [
      { nivel: 'Tenant', idTenant: 'tenant-a' },
    ]);
    service.setServer({ clients: new Set([tenantA]) } as any);

    expect(
      service.getSesionesPorAlcance({ idProductor: 'productor-a' }),
    ).toEqual([]);
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

  it('no usa id de usuario como bypass cuando existe alcance tenant', () => {
    const service = new WebsocketService({} as any);
    const objetivo = socket('usuario-a', []);
    service.setServer({ clients: new Set([objetivo]) } as any);

    expect(
      service.getSesionesPorAlcance(
        { idProductor: 'productor-sin-permiso' },
        'usuario-a',
      ),
    ).toEqual([]);
  });

  it('entrega al asesor solo eventos de establecimientos y lotes asignados', () => {
    const service = new WebsocketService({} as any);
    const asesor = socket('asesor-a', [
      {
        nivel: 'Asesor',
        idEstablecimientos: ['est-1', 'est-2'],
        idLotes: ['lote-1'],
      },
    ]);
    service.setServer({ clients: new Set([asesor]) } as any);

    expect(
      service.getSesionesPorAlcance({
        idEstablecimiento: 'est-1',
        idLote: 'lote-1',
      }),
    ).toEqual([asesor]);
    expect(
      service.getSesionesPorAlcance({
        idEstablecimiento: 'est-1',
        idLote: 'lote-2',
      }),
    ).toEqual([]);
    expect(
      service.getSesionesPorAlcance({ idEstablecimiento: 'est-3' }),
    ).toEqual([]);
  });

  it('entrega al asesor eventos de la cartera creada por el mismo', () => {
    const service = new WebsocketService({} as any);
    const asesor = socket('asesor-a', [
      { nivel: 'Asesor', idAsesor: 'asesor-a', idEstablecimientos: [] },
    ]);
    service.setServer({ clients: new Set([asesor]) } as any);

    expect(
      service.getSesionesPorAlcance({
        idAsesorPropietario: 'asesor-a',
        idEstablecimiento: 'est-propio',
      }),
    ).toEqual([asesor]);
    expect(
      service.getSesionesPorAlcance({
        idAsesorPropietario: 'asesor-b',
        idEstablecimiento: 'est-ajeno',
      }),
    ).toEqual([]);
  });
});

describe('WebsocketService - vencimiento de sesion autenticada', () => {
  const now = new Date('2026-07-23T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function authenticatedSubject(expiries: {
    accessTokenExpiresAt: string;
    sessionAbsoluteExpiresAt?: string;
  }) {
    const auth = {
      authorization: jest.fn().mockResolvedValue({
        accessToken: 'token',
        client: {},
        user: {
          _id: 'usuario-1',
          username: 'usuario-1',
          permisos: [],
        },
        ...expiries,
      }),
    };
    const socket = {
      close: jest.fn(),
    } as any;
    return {
      service: new WebsocketService(auth as any),
      auth,
      socket,
    };
  }

  it('cierra el socket al vencer el access token autenticado', async () => {
    const { service, socket } = authenticatedSubject({
      accessTokenExpiresAt: new Date(now.getTime() + 1_000).toISOString(),
      sessionAbsoluteExpiresAt: new Date(now.getTime() + 10_000).toISOString(),
    });

    await service.authenticateUsuario('Bearer token', socket);
    jest.advanceTimersByTime(999);
    expect(socket.close).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(socket.close).toHaveBeenCalledWith(4401, 'Sesion expirada');
    expect(socket.usuario).toBeUndefined();
  });

  it('usa el vencimiento absoluto cuando ocurre antes que el access token', async () => {
    const { service, socket } = authenticatedSubject({
      accessTokenExpiresAt: new Date(now.getTime() + 10_000).toISOString(),
      sessionAbsoluteExpiresAt: new Date(now.getTime() + 2_000).toISOString(),
    });

    await service.authenticateUsuario('Bearer token', socket);
    jest.advanceTimersByTime(2_000);

    expect(socket.close).toHaveBeenCalledWith(4401, 'Sesion expirada');
  });

  it('reautenticar reemplaza el temporizador anterior', async () => {
    const firstExpiry = new Date(now.getTime() + 1_000).toISOString();
    const secondExpiry = new Date(now.getTime() + 5_000).toISOString();
    const auth = {
      authorization: jest
        .fn()
        .mockResolvedValueOnce({
          accessToken: 'token-1',
          accessTokenExpiresAt: firstExpiry,
          client: {},
          user: { _id: 'usuario-1', permisos: [] },
        })
        .mockResolvedValueOnce({
          accessToken: 'token-2',
          accessTokenExpiresAt: secondExpiry,
          client: {},
          user: { _id: 'usuario-1', permisos: [] },
        }),
    };
    const service = new WebsocketService(auth as any);
    const socket = { close: jest.fn() } as any;

    await service.authenticateUsuario('Bearer token-1', socket);
    await service.authenticateUsuario('Bearer token-2', socket);
    jest.advanceTimersByTime(1_000);
    expect(socket.close).not.toHaveBeenCalled();

    jest.advanceTimersByTime(4_000);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledWith(4401, 'Sesion expirada');
  });

  it('rechaza una respuesta de autenticacion sin vencimiento valido', async () => {
    const { service, socket } = authenticatedSubject({
      accessTokenExpiresAt: 'fecha-invalida',
    });

    await expect(
      service.authenticateUsuario('Bearer token', socket),
    ).resolves.toBe('Autenticacion invalida');
    expect(socket.close).toHaveBeenCalledWith(
      4401,
      'Autenticacion invalida',
    );
    expect(socket.sessionExpiryTimer).toBeUndefined();
  });

  it('limpia los temporizadores al desconectar', async () => {
    const service = {
      clearSocketTimers: jest.fn(),
    };
    const gateway = new EventsGateway(service as any);
    (gateway as any).server = { clients: { size: 0 } };
    const socket = {
      usuario: { username: 'usuario-1' },
      authTimer: setTimeout(() => undefined, 1_000),
      sessionExpiryTimer: setTimeout(() => undefined, 2_000),
    } as any;

    await gateway.handleDisconnect(socket);

    expect(service.clearSocketTimers).toHaveBeenCalledWith(socket);
  });
});
