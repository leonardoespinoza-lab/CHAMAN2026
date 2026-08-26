import {
  CATALOGO_CULTIVOS_FORMATO_VERSION,
  IFilaCatalogoCultivos,
  IImportacionCatalogoCultivosRequest,
  IResistencia,
  ISemilla,
  hashCatalogoEstable,
  snapshotSemillaCatalogo,
} from 'modelos/src';
import { Types } from 'mongoose';
import { CatalogImportService } from './catalog-import.service';

const ROYA = 'trigo.roya_hoja' as const;
const FUSARIUM = 'trigo.fusarium_espiga' as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function seed(
  id: string,
  variedad: string,
  profile: 'R' | 'MR' | 'MS' | 'S' = 'S',
): ISemilla & { _id: string; __v: number } {
  const rules = {
    R: { multiplicador: 0.05, indiceResistencia: 1 },
    MR: { multiplicador: 0.5, indiceResistencia: 2 / 3 },
    MS: { multiplicador: 0.75, indiceResistencia: 1 / 3 },
    S: { multiplicador: 1, indiceResistencia: 0 },
  };
  return {
    _id: id,
    __v: 0,
    cultivo: 'Trigo',
    semillero: 'Semillero prueba',
    variedad,
    ciclo: 'INTERMEDIO',
    campania: '2025-2026',
    fuenteBase: 'Catálogo protegido',
    fichaVarietal: {
      version: '1',
      estado: 'referencia_documental',
      nombreOficial: variedad,
    },
    parametrosAgrometeorologicos: {
      version: 'termico-1',
      estado: 'requiere_calibracion',
    } as any,
    resistencia: [
      {
        idEnfermedad: ROYA,
        enfermedad: 'Roya de la Hoja',
        perfil: profile,
        ...rules[profile],
        estado: 'historica',
        confianza: 'media',
        fuente: 'Fuente anterior',
        fuenteUrl: 'https://example.test/fuente-anterior',
        campaniaFuente: '2024-2025',
        observaciones: 'Metadato que debe conservarse',
      },
      {
        idEnfermedad: FUSARIUM,
        enfermedad: 'Fusarium de la Espiga',
        perfil: 'DESCONOCIDA',
        multiplicador: 1,
        indiceResistencia: 0,
        estado: 'desconocida',
        confianza: 'sin_datos',
        detalleSanitario: {
          metodo: 'ensayo específico',
          interpretacion: 'No convertir automáticamente',
        },
      },
    ],
  };
}

function rowFor(
  current: ISemilla & { _id: string },
  perfiles: IFilaCatalogoCultivos['perfiles'],
  overrides: Partial<IFilaCatalogoCultivos> = {},
): IFilaCatalogoCultivos {
  return {
    fila: 2,
    hoja: current.cultivo as 'Trigo',
    id: current._id,
    snapshot: snapshotSemillaCatalogo(current),
    semillero: current.semillero!,
    variedad: current.variedad!,
    ciclo: current.ciclo!,
    campania: current.campania,
    perfiles,
    ...overrides,
  };
}

function request(
  filas: IFilaCatalogoCultivos[],
  modo: IImportacionCatalogoCultivosRequest['modo'] = 'previsualizar',
  planHash?: string,
): IImportacionCatalogoCultivosRequest {
  return {
    formatoVersion: CATALOGO_CULTIVOS_FORMATO_VERSION,
    modo,
    ...(planHash ? { planHash } : {}),
    filas,
  };
}

function repositorySubject(initial: Array<ISemilla & { _id: string }>) {
  const state = clone(initial) as Array<
    ISemilla & { _id: string; __v?: number }
  >;
  let failOnceForId: string | undefined;
  let failAfterPersistForId: string | undefined;
  let onInjectedFailure: (() => void) | undefined;
  let failCreateAfterPersist = false;
  let beforeNextReplace: (() => void) | undefined;

  const repository = {
    getAllForCatalogImport: jest.fn(async () => clone(state)),
    getById: jest.fn(async (id: string) => {
      const found = state.find((item) => String(item._id) === String(id));
      return found ? clone(found) : null;
    }),
    validateCatalogDocument: jest.fn(async (document: ISemilla) => {
      if (
        !document.cultivo ||
        !document.semillero ||
        !document.variedad ||
        !document.ciclo
      ) {
        throw new Error('identidad requerida');
      }
    }),
    replaceCatalogResistance: jest.fn(
      async (
        id: string,
        expectedIdentity: Partial<ISemilla>,
        expected: IResistencia[],
        replacement: IResistencia[],
      ) => {
        if (failOnceForId === id) {
          failOnceForId = undefined;
          onInjectedFailure?.();
          throw new Error('falla de escritura inyectada');
        }
        const beforeReplace = beforeNextReplace;
        beforeNextReplace = undefined;
        beforeReplace?.();
        const found = state.find((item) => String(item._id) === String(id));
        if (
          !found ||
          ['cultivo', 'semillero', 'variedad', 'ciclo', 'campania'].some(
            (field) =>
              hashCatalogoEstable((found as any)[field]) !==
              hashCatalogoEstable((expectedIdentity as any)[field]),
          ) ||
          hashCatalogoEstable(found.resistencia || []) !==
            hashCatalogoEstable(expected || [])
        ) {
          return null;
        }
        found.resistencia = clone(replacement);
        if (failAfterPersistForId === id) {
          failAfterPersistForId = undefined;
          throw new Error('ACK de actualización perdido');
        }
        return clone(found);
      },
    ),
    createCatalogDocument: jest.fn(
      async (document: ISemilla & { _id: string }) => {
        const created = { ...clone(document), __v: 0 };
        state.push(created);
        if (failCreateAfterPersist) {
          failCreateAfterPersist = false;
          throw new Error('ACK de alta perdido');
        }
        return clone(created);
      },
    ),
    deleteCreatedCatalogDocument: jest.fn(async (id: string) => {
      const index = state.findIndex((item) => String(item._id) === String(id));
      if (index < 0) return false;
      state.splice(index, 1);
      return true;
    }),
  };

  return {
    state,
    repository,
    service: new CatalogImportService(repository as any),
    failNextWriteFor(id: string, callback?: () => void) {
      failOnceForId = id;
      onInjectedFailure = callback;
    },
    failNextCreateAfterPersist() {
      failCreateAfterPersist = true;
    },
    failNextUpdateAfterPersist(id: string) {
      failAfterPersistForId = id;
    },
    mutateBeforeNextReplace(callback: () => void) {
      beforeNextReplace = callback;
    },
  };
}

describe('CatalogImportService', () => {
  it('genera el mismo snapshot para ObjectId lean y para el JSON enviado al frontend', () => {
    const mongoLean = {
      ...seed('64e124433f02744000000000', 'Snapshot ObjectId'),
      _id: new Types.ObjectId('64e124433f02744000000000'),
    } as any;
    const frontend = JSON.parse(JSON.stringify(mongoLean));

    expect(snapshotSemillaCatalogo(mongoLean)).toBe(
      snapshotSemillaCatalogo(frontend),
    );
  });

  it('previsualiza una categoría derivada y preserva metadatos y campos ocultos', async () => {
    const current = seed('64e124433f02744000000001', 'Variedad Uno');
    const { service, repository } = repositorySubject([current]);

    const result = await service.importar(
      request([
        rowFor(
          current,
          { [ROYA]: 'R', [FUSARIUM]: 'DATO_ESPECIFICO' },
          {
            fuenteActualizacion: 'Ensayo INTA 2026',
            campaniaFuente: '2025-2026',
            estado: 'observada',
            confianza: 'alta',
          },
        ),
      ]),
    );

    expect(result.errores).toEqual([]);
    expect(result.actualizaciones).toBe(1);
    expect(result.planHash).toMatch(/^v1-/);
    const effective = repository.validateCatalogDocument.mock.calls[0][0];
    expect(effective.fichaVarietal).toEqual(current.fichaVarietal);
    expect(effective.parametrosAgrometeorologicos).toEqual(
      current.parametrosAgrometeorologicos,
    );
    expect(effective.resistencia[0]).toMatchObject({
      idEnfermedad: ROYA,
      perfil: 'R',
      multiplicador: 0.05,
      indiceResistencia: 1,
      fuente: 'Ensayo INTA 2026',
      fuenteUrl: 'https://example.test/fuente-anterior',
      observaciones: 'Metadato que debe conservarse',
    });
    expect(effective.resistencia[1]).toEqual(current.resistencia![1]);
  });

  it('confirma con compare-and-set y sólo reemplaza la matriz sanitaria', async () => {
    const current = seed('64e124433f02744000000002', 'Variedad Dos');
    const subject = repositorySubject([current]);
    const fila = rowFor(
      current,
      { [ROYA]: 'MR' },
      {
        fuenteActualizacion: 'Red oficial 2026',
      },
    );
    const preview = await subject.service.importar(request([fila]));

    const confirmed = await subject.service.importar(
      request([fila], 'confirmar', preview.planHash),
    );

    expect(confirmed.errores).toEqual([]);
    expect(confirmed.idsActualizados).toEqual([current._id]);
    expect(subject.repository.replaceCatalogResistance).toHaveBeenCalledWith(
      current._id,
      expect.objectContaining({
        cultivo: current.cultivo,
        semillero: current.semillero,
        variedad: current.variedad,
        ciclo: current.ciclo,
        campania: current.campania,
      }),
      current.resistencia,
      expect.arrayContaining([
        expect.objectContaining({
          idEnfermedad: ROYA,
          perfil: 'MR',
          multiplicador: 0.5,
        }),
      ]),
    );
    expect(subject.state[0].fichaVarietal).toEqual(current.fichaVarietal);
    expect(subject.state[0].parametrosAgrometeorologicos).toEqual(
      current.parametrosAgrometeorologicos,
    );
  });

  it('no aplica perfiles si la identidad cambia entre el precheck y el CAS', async () => {
    const current = seed('64e124433f02744000000014', 'Carrera identidad');
    const subject = repositorySubject([current]);
    const fila = rowFor(
      current,
      { [ROYA]: 'R' },
      { fuenteActualizacion: 'Ensayo' },
    );
    const preview = await subject.service.importar(request([fila]));
    subject.mutateBeforeNextReplace(() => {
      subject.state[0].cultivo = 'Maiz';
    });

    await expect(
      subject.service.importar(request([fila], 'confirmar', preview.planHash)),
    ).rejects.toThrow(/rollback verificado/);

    expect(subject.state[0].cultivo).toBe('Maiz');
    expect(subject.state[0].resistencia).toEqual(current.resistencia);
  });

  it('trata vacío y SIN_REGISTRO como preservar y produce cero escrituras', async () => {
    const current = seed('64e124433f02744000000003', 'Variedad Tres');
    const subject = repositorySubject([current]);
    const fila = rowFor(current, { [ROYA]: 'SIN_REGISTRO', [FUSARIUM]: '' });
    const preview = await subject.service.importar(request([fila]));
    const confirmed = await subject.service.importar(
      request([fila], 'confirmar', preview.planHash),
    );

    expect(preview.sinCambios).toBe(1);
    expect(confirmed.idsCreados).toEqual([]);
    expect(confirmed.idsActualizados).toEqual([]);
    expect(subject.repository.replaceCatalogResistance).not.toHaveBeenCalled();
    expect(subject.repository.createCatalogDocument).not.toHaveBeenCalled();
    expect(subject.state).toEqual([current]);
  });

  it('rechaza snapshot obsoleto e identidad modificada', async () => {
    const current = seed('64e124433f02744000000004', 'Variedad Cuatro');
    const { service } = repositorySubject([current]);
    const result = await service.importar(
      request([
        rowFor(
          current,
          { [ROYA]: 'R' },
          {
            snapshot: 'v1-obsoleto',
            variedad: 'Otra variedad',
            fuenteActualizacion: 'Ensayo',
          },
        ),
      ]),
    );

    expect(result.errores.map((error) => error.campo)).toEqual(
      expect.arrayContaining(['snapshot', 'identidad']),
    );
    expect(result.planHash).toBeUndefined();
  });

  it('exige fuente para una categoría conocida', async () => {
    const current = seed('64e124433f02744000000005', 'Variedad Cinco');
    const { service } = repositorySubject([current]);
    const result = await service.importar(
      request([rowFor(current, { [ROYA]: 'R' })]),
    );

    expect(result.errores).toEqual([
      expect.objectContaining({ campo: 'fuenteActualizacion' }),
    ]);
  });

  it('rechaza una fecha calendario imposible aunque tenga formato ISO', async () => {
    const current = seed('64e124433f02744000000012', 'Fecha imposible');
    const { service } = repositorySubject([current]);
    const result = await service.importar(
      request([
        rowFor(
          current,
          { [ROYA]: 'R' },
          {
            fuenteActualizacion: 'Ensayo',
            fechaFuente: '2026-02-31',
          },
        ),
      ]),
    );

    expect(result.errores).toEqual([
      expect.objectContaining({ campo: 'fechaFuente' }),
    ]);
  });

  it('reconcilia por nombre canónico un idEnfermedad legacy inválido sin duplicar', async () => {
    const current = seed('64e124433f02744000000013', 'ID legacy');
    current.resistencia![0].idEnfermedad = 'trigo.roya_hoja_legacy' as any;
    const { service, repository } = repositorySubject([current]);

    const result = await service.importar(
      request([
        rowFor(
          current,
          { [ROYA]: 'R' },
          { fuenteActualizacion: 'Ensayo de reconciliación' },
        ),
      ]),
    );

    expect(result.errores).toEqual([]);
    const effective = repository.validateCatalogDocument.mock.calls[0][0];
    expect(effective.resistencia).toHaveLength(2);
    expect(effective.resistencia[0]).toMatchObject({
      idEnfermedad: ROYA,
      perfil: 'R',
    });
  });

  it('crea sólo sin ID y rechaza usar una identidad existente como alta', async () => {
    const current = seed('64e124433f02744000000006', 'Existente');
    const subject = repositorySubject([current]);
    const duplicate: IFilaCatalogoCultivos = {
      fila: 2,
      hoja: 'Trigo',
      semillero: current.semillero!,
      variedad: current.variedad!,
      ciclo: current.ciclo!,
      campania: current.campania,
      perfiles: { [ROYA]: 'R' },
      fuenteActualizacion: 'Ensayo',
    };
    const duplicateResult = await subject.service.importar(
      request([duplicate]),
    );
    expect(duplicateResult.errores).toEqual([
      expect.objectContaining({ campo: 'id' }),
    ]);

    const fresh = { ...duplicate, fila: 3, variedad: 'Nueva variedad' };
    const preview = await subject.service.importar(request([fresh]));
    const confirmed = await subject.service.importar(
      request([fresh], 'confirmar', preview.planHash),
    );
    expect(confirmed.altas).toBe(1);
    expect(confirmed.idsCreados).toHaveLength(1);
    expect(
      subject.state.find((item) => item.variedad === 'Nueva variedad'),
    ).toMatchObject({
      resistencia: [
        expect.objectContaining({ perfil: 'R', multiplicador: 0.05 }),
      ],
    });
  });

  it('valida todas las filas y no escribe nada si una sola es inválida', async () => {
    const subject = repositorySubject([]);
    const valid: IFilaCatalogoCultivos = {
      fila: 2,
      hoja: 'Trigo',
      semillero: 'A',
      variedad: 'Válida',
      ciclo: 'CORTO',
      perfiles: { [ROYA]: 'R' },
      fuenteActualizacion: 'Ensayo',
    };
    const invalid = {
      ...valid,
      fila: 3,
      variedad: '',
      perfiles: { [ROYA]: 'XX' },
    };

    const result = await subject.service.importar(
      request([valid, invalid], 'confirmar', 'plan-inexistente'),
    );

    expect(result.errores.length).toBeGreaterThan(0);
    expect(subject.repository.createCatalogDocument).not.toHaveBeenCalled();
    expect(subject.state).toEqual([]);
  });

  it('revierte y verifica las actualizaciones previas si una escritura falla', async () => {
    const first = seed('64e124433f02744000000007', 'Primera');
    const second = seed('64e124433f02744000000008', 'Segunda');
    const subject = repositorySubject([first, second]);
    const rows = [first, second].map((current, index) =>
      rowFor(
        current,
        { [ROYA]: index ? 'MR' : 'R' },
        {
          fila: index + 2,
          fuenteActualizacion: 'Ensayo conjunto',
        },
      ),
    );
    const preview = await subject.service.importar(request(rows));
    subject.failNextWriteFor(second._id);

    await expect(
      subject.service.importar(request(rows, 'confirmar', preview.planHash)),
    ).rejects.toThrow(/rollback verificado/);

    expect(subject.state).toEqual([first, second]);
    expect(subject.repository.getById).toHaveBeenCalled();
  });

  it('revierte una actualización aplicada aunque se pierda su confirmación', async () => {
    const current = seed('64e124433f02744000000015', 'Update con ACK perdido');
    const subject = repositorySubject([current]);
    const fila = rowFor(
      current,
      { [ROYA]: 'R' },
      { fuenteActualizacion: 'Ensayo' },
    );
    const preview = await subject.service.importar(request([fila]));
    subject.failNextUpdateAfterPersist(current._id);

    await expect(
      subject.service.importar(request([fila], 'confirmar', preview.planHash)),
    ).rejects.toThrow(/rollback verificado/);

    expect(subject.state).toEqual([current]);
  });

  it('elimina un alta compensatoriamente si una escritura posterior falla', async () => {
    const existing = seed('64e124433f02744000000009', 'Existente rollback');
    const subject = repositorySubject([existing]);
    const fresh: IFilaCatalogoCultivos = {
      fila: 2,
      hoja: 'Trigo',
      semillero: 'Nuevo',
      variedad: 'Alta transitoria',
      ciclo: 'LARGO',
      perfiles: { [ROYA]: 'R' },
      fuenteActualizacion: 'Ensayo',
    };
    const update = rowFor(
      existing,
      { [ROYA]: 'MR' },
      {
        fila: 3,
        fuenteActualizacion: 'Ensayo',
      },
    );
    const preview = await subject.service.importar(request([fresh, update]));
    subject.failNextWriteFor(existing._id);

    await expect(
      subject.service.importar(
        request([fresh, update], 'confirmar', preview.planHash),
      ),
    ).rejects.toThrow(/rollback verificado/);

    expect(subject.state).toEqual([existing]);
    expect(subject.repository.deleteCreatedCatalogDocument).toHaveBeenCalled();
  });

  it('compensa un alta aplicada aunque se pierda su confirmación de Mongo', async () => {
    const subject = repositorySubject([]);
    const fresh: IFilaCatalogoCultivos = {
      fila: 2,
      hoja: 'Trigo',
      semillero: 'Nuevo',
      variedad: 'Alta con ACK perdido',
      ciclo: 'CORTO',
      perfiles: { [ROYA]: 'R' },
      fuenteActualizacion: 'Ensayo',
    };
    const preview = await subject.service.importar(request([fresh]));
    subject.failNextCreateAfterPersist();

    await expect(
      subject.service.importar(request([fresh], 'confirmar', preview.planHash)),
    ).rejects.toThrow(/rollback verificado/);

    expect(subject.state).toEqual([]);
    expect(
      subject.repository.deleteCreatedCatalogDocument,
    ).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ __v: 0, variedad: 'Alta con ACK perdido' }),
    );
  });

  it('informa rollback incompleto si detecta un estado concurrente ambiguo', async () => {
    const first = seed('64e124433f02744000000010', 'Concurrente Uno');
    const second = seed('64e124433f02744000000011', 'Concurrente Dos');
    const subject = repositorySubject([first, second]);
    const rows = [first, second].map((current, index) =>
      rowFor(
        current,
        { [ROYA]: index ? 'MR' : 'R' },
        {
          fila: index + 2,
          fuenteActualizacion: 'Ensayo',
        },
      ),
    );
    const preview = await subject.service.importar(request(rows));
    subject.failNextWriteFor(second._id, () => {
      subject.state[0].resistencia![0].perfil = 'MS';
      subject.state[0].resistencia![0].multiplicador = 0.75;
    });

    await expect(
      subject.service.importar(request(rows, 'confirmar', preview.planHash)),
    ).rejects.toThrow(/rollback quedó incompleto/);
  });
});
