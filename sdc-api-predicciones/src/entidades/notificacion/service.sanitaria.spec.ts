import { ICreateNotificacion, INotificacion, IQueryParam } from 'modelos/src';
import { NotificacionsService } from './service';

describe('NotificacionsService - predicciones sanitarias', () => {
  const AHORA = '2026-07-15T12:00:00.000Z';
  const siembra = {
    _id: 'siembra-1',
    idProductor: 'productor-1',
    idEstablecimiento: 'establecimiento-1',
    semilla: { cultivo: 'Trigo' },
    lote: { nombre: 'Lote Norte' },
  } as any;

  const enfermedad = (resultado: number) =>
    ({
      enfermedad: 'Roya de la Hoja',
      idEnfermedad: 'trigo.roya_hoja',
      resultado,
      estado: 'calculado',
      calidadDatos: { nivel: 'media' },
      resistenciaUsada: {
        estado: 'observada',
        confianza: 'alta',
        campaniaFuente: '2025-2026',
      },
      modelo: {
        id: 'trigo.roya_hoja',
        version: 4,
        fuente: 'formula funcional auditada',
        validacion: 'operativo',
      },
      variables: { resultadoCrudo: resultado },
    }) as any;

  const crearServicio = (notificacionesIniciales: INotificacion[] = []) => {
    const almacen: INotificacion[] = [...notificacionesIniciales];
    const repository = {
      create: jest
        .fn()
        .mockImplementation(async (data: ICreateNotificacion) => {
          const guardada = {
            ...data,
            fechaCreacion: new Date(Date.now()),
          } as INotificacion;
          almacen.push(guardada);
          return guardada;
        }),
      getFiltered: jest.fn().mockImplementation(async (query: IQueryParam) => {
        const filter = JSON.parse(query.filter || '{}');
        let datos = almacen.filter((notificacion) => {
          if (
            filter['tenant.idUsuario'] !== undefined &&
            notificacion.tenant?.idUsuario !== filter['tenant.idUsuario']
          ) {
            return false;
          }
          if (
            filter['data.eventKey'] !== undefined &&
            notificacion.data?.eventKey !== filter['data.eventKey']
          ) {
            return false;
          }
          if (
            filter['data.dedupeKey'] !== undefined &&
            notificacion.data?.dedupeKey !== filter['data.dedupeKey']
          ) {
            return false;
          }
          return true;
        });

        if (query.sort === JSON.stringify({ fechaCreacion: -1 })) {
          datos = [...datos].sort(
            (a, b) =>
              new Date(b.fechaCreacion).getTime() -
              new Date(a.fechaCreacion).getTime(),
          );
        }
        const totalCount = datos.length;
        if (query.limit) {
          datos = datos.slice(0, Number(query.limit));
        }
        return { datos, totalCount };
      }),
    };
    const usuarios = {
      getPorIdProductor: jest.fn().mockResolvedValue([
        {
          _id: 'usuario-1',
          permisos: [
            {
              idProductor: 'productor-1',
              modulos: { Enfermedades: true },
            },
          ],
        },
      ]),
    };
    const tokens = {
      getPorIdsUsuarios: jest
        .fn()
        .mockResolvedValue([{ idUsuario: 'usuario-1', tokenPush: 'token-1' }]),
    };
    const push = { sendNotifications: jest.fn().mockResolvedValue(undefined) };
    const service = new NotificacionsService(
      repository as any,
      usuarios as any,
      tokens as any,
      push as any,
    );
    return { service, repository, usuarios, push, almacen };
  };

  const enviar = (
    service: NotificacionsService,
    resultado: number,
    fecha: string,
  ) =>
    service.enviarNotificaciones(
      [
        {
          fecha,
          idSiembra: 'siembra-1',
          enfermedades: [enfermedad(resultado)],
        },
      ] as any,
      siembra,
    );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(AHORA));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('no notifica una alerta historica si la ultima salida ya esta bajo umbral', async () => {
    const { service, repository, usuarios } = crearServicio();

    await service.enviarNotificaciones(
      [
        {
          fecha: '2026-07-14T00:00:00.000Z',
          enfermedades: [enfermedad(50)],
        },
        {
          fecha: '2026-07-15T00:00:00.000Z',
          enfermedades: [enfermedad(8)],
        },
      ] as any,
      siembra,
    );

    expect(usuarios.getPorIdProductor).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('envia la primera alerta y consulta el historial por usuario y dedupeKey', async () => {
    const { service, repository } = crearServicio();

    await service.enviarNotificaciones(
      [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          idSiembra: 'siembra-1',
          enfermedades: [enfermedad(24)],
        },
        {
          fecha: '2026-07-13T00:00:00.000Z',
          idSiembra: 'siembra-1',
          enfermedades: [enfermedad(70)],
        },
      ] as any,
      siembra,
    );

    expect(repository.create).toHaveBeenCalledTimes(1);
    const notificacion = repository.create.mock.calls[0][0];
    expect(notificacion.titulo).toBe('Predicción sanitaria');
    expect(notificacion.mensaje).toContain(
      'predicción meteorológica de severidad/incidencia',
    );
    expect(notificacion.mensaje).toContain('No confirma enfermedad');
    expect(notificacion.data).toEqual(
      expect.objectContaining({
        resultado: '24',
        versionModelo: '4',
        fechaPrediccion: '2026-07-15T00:00:00.000Z',
        dedupeKey: 'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
        eventKey: 'enfermedad:siembra-1:roya-de-la-hoja:v4:2026-07-15',
      }),
    );

    const consultaUltima = repository.getFiltered.mock.calls
      .map(([query]) => query)
      .find((query) => JSON.parse(query.filter)['data.dedupeKey']);
    expect(consultaUltima).toEqual({
      filter: JSON.stringify({
        'tenant.idUsuario': 'usuario-1',
        'data.dedupeKey': 'siembra-1:sanitaria:enfermedad:roya-de-la-hoja',
      }),
      sort: JSON.stringify({ fechaCreacion: -1 }),
      limit: 1,
    });
  });

  it('descarta una prediccion sanitaria con mas de 72 horas', async () => {
    const { service, repository, usuarios } = crearServicio();

    await enviar(service, 60, '2026-07-12T11:59:59.000Z');

    expect(usuarios.getPorIdProductor).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('acepta una prediccion sanitaria en el limite exacto de 72 horas', async () => {
    const { service, repository } = crearServicio();

    await enviar(service, 60, '2026-07-12T12:00:00.000Z');

    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('no envia push diario cuando el nivel permanece en la misma banda', async () => {
    const { service, repository, push } = crearServicio();
    await enviar(service, 30, '2026-07-15T00:00:00.000Z');

    const resultados = [31, 28, 44, 39, 30, 42];
    for (let dia = 1; dia <= resultados.length; dia += 1) {
      jest.setSystemTime(new Date(`2026-07-${15 + dia}T12:00:00.000Z`));
      await enviar(
        service,
        resultados[dia - 1],
        `2026-07-${15 + dia}T00:00:00.000Z`,
      );
    }

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(push.sendNotifications).toHaveBeenCalledTimes(1);
  });

  it('envia una nueva alerta si sube de banda despues de 24 horas', async () => {
    const { service, repository, push } = crearServicio();
    await enviar(service, 44, '2026-07-15T00:00:00.000Z');

    jest.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    await enviar(service, 45, '2026-07-16T00:00:00.000Z');

    expect(repository.create).toHaveBeenCalledTimes(2);
    expect(push.sendNotifications).toHaveBeenCalledTimes(2);
  });

  it('envia una nueva alerta si aumenta al menos 15 puntos dentro de la misma banda', async () => {
    const { service, repository } = crearServicio();
    await enviar(service, 50, '2026-07-15T00:00:00.000Z');

    jest.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    await enviar(service, 65, '2026-07-16T00:00:00.000Z');

    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('respeta el cooldown minimo de 24 horas aun ante una escalada fuerte', async () => {
    const { service, repository } = crearServicio();
    await enviar(service, 44, '2026-07-15T00:00:00.000Z');

    jest.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
    await enviar(service, 75, '2026-07-16T00:00:00.000Z');
    expect(repository.create).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    await enviar(service, 75, '2026-07-16T00:00:00.000Z');
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('permite un recordatorio estable al cumplirse 7 dias', async () => {
    const { service, repository } = crearServicio();
    await enviar(service, 30, '2026-07-15T00:00:00.000Z');

    jest.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    await enviar(service, 30, '2026-07-21T00:00:00.000Z');
    expect(repository.create).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    await enviar(service, 30, '2026-07-22T00:00:00.000Z');
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('conserva eventKey como barrera de duplicado exacto', async () => {
    const { service, repository } = crearServicio();

    await enviar(service, 40, '2026-07-15T00:00:00.000Z');
    await enviar(service, 40, '2026-07-15T00:00:00.000Z');

    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('evalua el historial de forma independiente para cada usuario', async () => {
    const dedupeKey = 'siembra-1:sanitaria:enfermedad:roya-de-la-hoja';
    const { service, repository, usuarios, almacen } = crearServicio();
    almacen.push({
      fechaCreacion: new Date('2026-07-14T12:00:00.000Z'),
      tenant: { idUsuario: 'usuario-1' },
      data: {
        dedupeKey,
        eventKey: 'enfermedad:siembra-1:roya-de-la-hoja:v4:2026-07-14',
        resultado: '30',
      },
    });
    usuarios.getPorIdProductor.mockResolvedValue([
      {
        _id: 'usuario-1',
        permisos: [
          {
            idProductor: 'productor-1',
            modulos: { Enfermedades: true },
          },
        ],
      },
      {
        _id: 'usuario-2',
        permisos: [
          {
            idProductor: 'productor-1',
            modulos: { Enfermedades: true },
          },
        ],
      },
    ]);

    await enviar(service, 31, '2026-07-15T00:00:00.000Z');

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create.mock.calls[0][0].tenant.idUsuario).toBe(
      'usuario-2',
    );
  });
});
