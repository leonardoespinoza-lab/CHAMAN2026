import { BadRequestException } from '@nestjs/common';
import { IPermiso, ISiembra } from 'modelos/src';
import { SiembrasService } from './service';

describe('SiembrasService - trazabilidad fenologica append-only', () => {
  const permiso: IPermiso = { nivel: 'Admin', rol: 'Admin' };

  function setup(registrosFenologicos: ISiembra['registrosFenologicos'] = []) {
    let persisted = {
      _id: 'siembra-1',
      idLote: 'lote-1',
      idSemilla: 'semilla-1',
      fechaSiembra: '2020-08-01T00:00:00.000Z',
      semilla: {
        cultivo: 'Manzano',
        variedad: 'Rosy Glow',
        ciclo: 'Perenne',
      },
      registrosFenologicos: structuredClone(registrosFenologicos),
    } as unknown as ISiembra;
    const repository = {
      getById: jest.fn(async () => structuredClone(persisted)),
      registrarEtapaFenologica: jest.fn(
        async (
          _id: string,
          registro: NonNullable<ISiembra['registrosFenologicos']>[number],
        ) => {
          persisted = {
            ...persisted,
            registrosFenologicos: [
              ...(persisted.registrosFenologicos || []),
              structuredClone(registro),
            ],
          };
        },
      ),
      reprocesarAgrometeorologia: jest.fn().mockResolvedValue(undefined),
    };
    const prediccionsService = {
      deleteByIdSiembra: jest.fn().mockResolvedValue(undefined),
      prediccion: jest.fn().mockResolvedValue([]),
      reconstruir: jest.fn().mockResolvedValue([]),
      agroclima: jest.fn().mockResolvedValue({}),
    };
    const service = new SiembrasService(
      repository as any,
      prediccionsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, repository, getPersisted: () => persisted };
  }

  it('genera el id en el servidor y agrega un evento nuevo sin aceptar un id reutilizable del cliente', async () => {
    const { service, repository, getPersisted } = setup();

    await service.registrarEtapaFenologica(
      'siembra-1',
      {
        id: 'id-controlado-por-cliente',
        etapa: 'Brotacion',
        fecha: '2026-07-10T12:00:00.000Z',
        tipoEvento: 'inicio_etapa',
      },
      permiso,
    );

    const [registro] = getPersisted().registrosFenologicos || [];
    expect(registro.id).toMatch(/^fen-/);
    expect(registro.id).not.toBe('id-controlado-por-cliente');
    expect(registro.creadoEn).toEqual(expect.any(String));
    expect(repository.registrarEtapaFenologica).toHaveBeenCalledTimes(1);
  });

  it('reprocesa clima antes de recalcular la prediccion sanitaria', async () => {
    const { service, repository } = setup();
    const prediccionsService = (service as any).prediccionsService;

    await service.registrarEtapaFenologica(
      'siembra-1',
      {
        etapa: 'Brotacion',
        fecha: '2026-07-10T12:00:00.000Z',
        tipoEvento: 'inicio_etapa',
      },
      permiso,
    );

    expect(
      repository.reprocesarAgrometeorologia.mock.invocationCallOrder[0],
    ).toBeLessThan(
      prediccionsService.reconstruir.mock.invocationCallOrder[0],
    );
    expect(
      prediccionsService.reconstruir.mock.invocationCallOrder[0],
    ).toBeLessThan(
      prediccionsService.agroclima.mock.invocationCallOrder[0],
    );
  });

  it('corrige agregando un evento enlazado y conserva intacto el registro original', async () => {
    const original = {
      id: 'fen-original',
      etapa: 'Brotacion',
      fecha: '2026-07-08T12:00:00.000Z',
      fechaInicioEtapa: '2026-07-08T12:00:00.000Z',
      tipoEvento: 'inicio_etapa' as const,
      accion: 'inicio' as const,
      creadoEn: '2026-07-09T09:00:00.000Z',
    };
    const { service, getPersisted } = setup([original]);

    await service.registrarEtapaFenologica(
      'siembra-1',
      {
        etapa: 'Brotacion',
        fecha: '2026-07-09T12:00:00.000Z',
        tipoEvento: 'correccion',
        accion: 'ajuste',
        reemplazaRegistroId: original.id,
      },
      permiso,
    );

    const registros = getPersisted().registrosFenologicos || [];
    expect(registros).toHaveLength(2);
    expect(registros[0]).toEqual(original);
    expect(registros[1]).toMatchObject({
      id: expect.stringMatching(/^fen-/),
      reemplazaRegistroId: original.id,
      etapa: 'Brotacion',
      tipoEvento: 'correccion',
      accion: 'ajuste',
    });
    expect(registros[1].id).not.toBe(original.id);
  });

  it('rechaza una segunda correccion sobre el mismo evento original', async () => {
    const original = {
      id: 'fen-original',
      etapa: 'Brotacion',
      fecha: '2026-07-08T12:00:00.000Z',
      tipoEvento: 'inicio_etapa' as const,
    };
    const correccion = {
      id: 'fen-correccion',
      etapa: 'Brotacion',
      fecha: '2026-07-09T12:00:00.000Z',
      tipoEvento: 'correccion' as const,
      reemplazaRegistroId: original.id,
    };
    const { service, repository } = setup([original, correccion]);

    await expect(
      service.registrarEtapaFenologica(
        'siembra-1',
        {
          etapa: 'Brotacion',
          fecha: '2026-07-10T12:00:00.000Z',
          tipoEvento: 'correccion',
          reemplazaRegistroId: original.id,
        },
        permiso,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.registrarEtapaFenologica).not.toHaveBeenCalled();
  });

  it('rechaza la reescritura directa de un identificador existente', async () => {
    const original = {
      id: 'fen-original',
      etapa: 'Brotacion',
      fecha: '2026-07-08T12:00:00.000Z',
      tipoEvento: 'inicio_etapa' as const,
    };
    const { service, repository } = setup([original]);

    await expect(
      service.registrarEtapaFenologica(
        'siembra-1',
        {
          ...original,
          fecha: '2026-07-09T12:00:00.000Z',
        },
        permiso,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.registrarEtapaFenologica).not.toHaveBeenCalled();
  });

  it('conserva metadatos auditables de la observacion de campo', async () => {
    const { service, getPersisted } = setup();

    await service.registrarEtapaFenologica(
      'siembra-1',
      {
        etapa: 'Brotacion',
        fecha: '2026-07-10T12:00:00.000Z',
        tipoEvento: 'inicio_etapa',
        escalaEtapa: 'BBCH',
        codigoEtapa: 'BBCH 09',
        coberturaObservadaPct: 72.5,
        confianza: 'alta',
        observador: 'Ing. Agr. Campo',
        observaciones: 'Yemas abiertas en recorrido diagonal.',
      },
      permiso,
    );

    expect(getPersisted().registrosFenologicos?.[0]).toMatchObject({
      escalaEtapa: 'BBCH',
      codigoEtapa: 'BBCH 09',
      coberturaObservadaPct: 72.5,
      confianza: 'alta',
      observador: 'Ing. Agr. Campo',
    });
  });

  it('rechaza porcentajes de cobertura fenologica imposibles', async () => {
    const { service, repository } = setup();

    await expect(
      service.registrarEtapaFenologica(
        'siembra-1',
        {
          etapa: 'Brotacion',
          fecha: '2026-07-10T12:00:00.000Z',
          coberturaObservadaPct: 120,
        },
        permiso,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.registrarEtapaFenologica).not.toHaveBeenCalled();
  });

  it.each([[undefined], [[]]])(
    'rechaza un biofix sin objetivos biologicos (%p)',
    async (objetivosBiofix) => {
      const { service, repository } = setup();

      await expect(
        service.registrarEtapaFenologica(
          'siembra-1',
          {
            etapa: 'Brotacion',
            fecha: '2026-07-10T12:00:00.000Z',
            tipoEvento: 'biofix',
            objetivosBiofix,
          },
          permiso,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repository.registrarEtapaFenologica).not.toHaveBeenCalled();
    },
  );

  it('rechaza objetivos de biofix fuera del vocabulario cientifico permitido', async () => {
    const { service, repository } = setup();

    await expect(
      service.registrarEtapaFenologica(
        'siembra-1',
        {
          etapa: 'Brotacion',
          fecha: '2026-07-10T12:00:00.000Z',
          tipoEvento: 'biofix',
          objetivosBiofix: ['objetivo_inventado'] as any,
        },
        permiso,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.registrarEtapaFenologica).not.toHaveBeenCalled();
  });

  it('deduplica los objetivos validos antes de persistir el biofix', async () => {
    const { service, getPersisted } = setup();

    await service.registrarEtapaFenologica(
      'siembra-1',
      {
        etapa: 'Brotacion',
        fecha: '2026-07-10T12:00:00.000Z',
        tipoEvento: 'biofix',
        objetivosBiofix: [
          'anclaje_fenologico',
          'inicio_forzado',
          'anclaje_fenologico',
          'inicio_forzado',
        ],
      },
      permiso,
    );

    expect(getPersisted().registrosFenologicos?.[0].objetivosBiofix).toEqual([
      'anclaje_fenologico',
      'inicio_forzado',
    ]);
  });
});
