import { BadRequestException } from '@nestjs/common';
import { SemillasService } from './service';

describe('SemillasService - normalizacion termica por cultivo', () => {
  const createSubject = () => {
    const repository = {
      getFilter: jest.fn(),
      getById: jest.fn(),
      create: jest.fn().mockImplementation(async (data) => data),
      bulk: jest.fn().mockImplementation(async (data) => data),
      update: jest.fn().mockImplementation(async (_id, data) => data),
      delete: jest.fn(),
    };
    return {
      service: new SemillasService(repository as any),
      repository,
    };
  };

  const parametrosMixtos = () =>
    ({
      version: 'agromet-test-1',
      temperaturaBaseC: 10,
      kcInicial: 0.4,
      profundidadRadicularCm: 80,
      procesoTermico: 'vernalizacion_anual',
      rangoVernalizacionC: { min: 0, max: 10 },
      requerimientoVernalizacion: 40,
      modeloVernalizacion: 'ventana_calibrada',
      habitoVernalizacion: 'invernal',
      fuenteVernalizacion: 'Fuente ensayo',
      estadoVernalizacion: 'validado',
      ventanaVernalizacion: {
        inicioEtapa: 'Emergencia',
        finEtapa: 'Encanazon',
        unidad: 'dias_equivalentes',
      },
    }) as any;

  const perfilTermicoValidado = () =>
    ({
      version: 'agromet-validado-1',
      estado: 'validado',
      fuente: 'Ensayo varietal 2025/2026',
      procesoTermico: 'termico_fotoperiodico',
      temperaturaBaseC: 8,
      temperaturaSuperiorC: 32,
      metodoGdd: 'promedio_limitado',
      semanticaGddPorEtapa:
        'rangos_acumulados_desde_inicio_termico',
      gddPorEtapa: {
        Emergencia: { orden: 1, min: 0, max: 120 },
        Floracion: { orden: 2, min: 500, max: 700 },
      },
    }) as any;

  it('elimina frio y vernalizacion incompatibles al crear un cultivo anual', async () => {
    const { service, repository } = createSubject();

    await service.create({
      cultivo: 'Maiz',
      requerimientoFrio: {
        modeloRector: 'HF',
        horasFrio: 600,
      },
      parametrosAgrometeorologicos: parametrosMixtos(),
    } as any);

    const persisted = repository.create.mock.calls[0][0];
    expect(persisted.requerimientoFrio).toBeUndefined();
    expect(persisted.parametrosAgrometeorologicos).toEqual({
      version: 'agromet-test-1',
      temperaturaBaseC: 10,
      kcInicial: 0.4,
      profundidadRadicularCm: 80,
    });
  });

  it('conserva requerimiento de frio en perennes pero no metadatos de vernalizacion', async () => {
    const { service, repository } = createSubject();

    await service.create({
      cultivo: 'Manzano',
      variedad: 'Gala',
      requerimientoFrio: {
        modeloRector: 'CP',
        porcionesFrio: 55,
        estado: 'validado',
        fuente: 'Ensayo varietal INTA',
      },
      parametrosAgrometeorologicos: {
        ...parametrosMixtos(),
        procesoTermico: 'dormancia_perenne',
      },
    } as any);

    const persisted = repository.create.mock.calls[0][0];
    expect(persisted.requerimientoFrio).toMatchObject({
      modeloRector: 'CP',
      porcionesFrio: 55,
    });
    expect(persisted.parametrosAgrometeorologicos).toEqual({
      version: 'agromet-test-1',
      temperaturaBaseC: 10,
      kcInicial: 0.4,
      profundidadRadicularCm: 80,
      procesoTermico: 'dormancia_perenne',
    });
  });

  it('normaliza tambien el alta masiva segun cada cultivo', async () => {
    const { service, repository } = createSubject();

    await service.bulk([
      {
        cultivo: 'Trigo',
        variedad: 'Trigo de prueba',
        requerimientoFrio: { horasFrio: 300 },
        parametrosAgrometeorologicos: parametrosMixtos(),
      },
      {
        cultivo: 'Pecan',
        variedad: 'Pecan de prueba',
        requerimientoFrio: { horasFrio: 900 },
        parametrosAgrometeorologicos: parametrosMixtos(),
      },
    ] as any);

    const [trigo, pecan] = repository.bulk.mock.calls[0][0];
    expect(trigo.requerimientoFrio).toBeUndefined();
    expect(trigo.parametrosAgrometeorologicos).toMatchObject({
      procesoTermico: 'vernalizacion_anual',
      requerimientoVernalizacion: 40,
      modeloVernalizacion: 'ventana_calibrada',
    });
    expect(pecan.requerimientoFrio).toMatchObject({ horasFrio: 900 });
    expect(
      pecan.parametrosAgrometeorologicos.requerimientoVernalizacion,
    ).toBeUndefined();
    expect(pecan.parametrosAgrometeorologicos.procesoTermico).toBeUndefined();
  });

  it('al cambiar Trigo a Maiz solicita unset solo de metadatos incompatibles', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Trigo',
      parametrosAgrometeorologicos: parametrosMixtos(),
    });

    await service.update('semilla-1', {
      cultivo: 'Maiz',
      observaciones: 'Cambio de clasificacion',
      parametrosAgrometeorologicos: {
        version: 'agromet-test-2',
        kcInicial: 0.5,
        procesoTermico: 'termico',
      },
    } as any);

    const [, update, unsetPaths] = repository.update.mock.calls[0];
    expect(update).toEqual({
      cultivo: 'Maiz',
      observaciones: 'Cambio de clasificacion',
      parametrosAgrometeorologicos: {
        version: 'agromet-test-2',
        kcInicial: 0.5,
        procesoTermico: 'termico',
      },
    });
    expect(unsetPaths).toEqual(
      expect.arrayContaining([
        'requerimientoFrio',
        'parametrosAgrometeorologicos.rangoVernalizacionC',
        'parametrosAgrometeorologicos.requerimientoVernalizacion',
        'parametrosAgrometeorologicos.modeloVernalizacion',
        'parametrosAgrometeorologicos.habitoVernalizacion',
        'parametrosAgrometeorologicos.fuenteVernalizacion',
        'parametrosAgrometeorologicos.estadoVernalizacion',
      ]),
    );
    expect(unsetPaths).not.toContain(
      'parametrosAgrometeorologicos.procesoTermico',
    );
  });

  it('al cambiar Manzano a Trigo elimina frio y conserva la vernalizacion recibida', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Manzano',
      variedad: 'Variedad migrada',
      requerimientoFrio: { horasFrio: 600 },
      parametrosAgrometeorologicos: {
        version: 'agromet-test-1',
        procesoTermico: 'dormancia_perenne',
      },
    });
    const parametrosTrigo = parametrosMixtos();

    await service.update('semilla-1', {
      cultivo: 'Trigo',
      parametrosAgrometeorologicos: parametrosTrigo,
    } as any);

    const [, update, unsetPaths] = repository.update.mock.calls[0];
    expect(update.parametrosAgrometeorologicos).toMatchObject({
      procesoTermico: 'vernalizacion_anual',
      requerimientoVernalizacion: 40,
      modeloVernalizacion: 'ventana_calibrada',
    });
    expect(unsetPaths).toContain('requerimientoFrio');
    expect(unsetPaths).not.toContain(
      'parametrosAgrometeorologicos.requerimientoVernalizacion',
    );
    expect(unsetPaths).not.toContain(
      'parametrosAgrometeorologicos.procesoTermico',
    );
  });

  it('una edicion menor sanea metadatos incompatibles preexistentes', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Soja',
      requerimientoFrio: { porcionesFrio: 20 },
      parametrosAgrometeorologicos: parametrosMixtos(),
    });

    await service.update('semilla-1', {
      observaciones: 'Revision 2026',
    });

    const [, update, unsetPaths] = repository.update.mock.calls[0];
    expect(update).toEqual({ observaciones: 'Revision 2026' });
    expect(unsetPaths).toEqual(
      expect.arrayContaining([
        'requerimientoFrio',
        'parametrosAgrometeorologicos.requerimientoVernalizacion',
        'parametrosAgrometeorologicos.procesoTermico',
      ]),
    );
  });

  it.each([
    ['Manzano', 'termico', undefined],
    ['Trigo', 'dormancia_perenne', undefined],
    ['Maiz', 'dormancia_perenne', undefined],
    ['Manzano', 'dormancia_perenne', 'dormancia_perenne'],
    ['Cebada', 'vernalizacion_anual', 'vernalizacion_anual'],
    ['Arveja', 'vernalizacion_anual', 'vernalizacion_anual'],
    ['Arveja', 'termico_fotoperiodico', 'termico_fotoperiodico'],
    ['Soja', 'termico_fotoperiodico', 'termico_fotoperiodico'],
    ['Papa', 'termico', 'termico'],
  ])(
    'al crear %s solo persiste un proceso termico compatible',
    async (cultivo, procesoTermico, esperado) => {
      const { service, repository } = createSubject();

      await service.create({
        cultivo,
        parametrosAgrometeorologicos: {
          version: 'agromet-test-1',
          temperaturaBaseC: 5,
          procesoTermico,
        },
      } as any);

      expect(
        repository.create.mock.calls[0][0].parametrosAgrometeorologicos,
      ).toEqual({
        version: 'agromet-test-1',
        temperaturaBaseC: 5,
        ...(esperado ? { procesoTermico: esperado } : {}),
      });
    },
  );

  it.each(['Maiz', 'Soja', 'Arveja', 'Papa'])(
    'al cambiar Manzano a %s elimina dormancia_perenne aunque no lleguen parametros',
    async (cultivo) => {
      const { service, repository } = createSubject();
      repository.getById.mockResolvedValue({
        cultivo: 'Manzano',
        requerimientoFrio: { horasFrio: 600 },
        parametrosAgrometeorologicos: {
          version: 'agromet-test-1',
          temperaturaBaseC: 7,
          kcInicial: 0.4,
          profundidadRadicularCm: 100,
          procesoTermico: 'dormancia_perenne',
        },
      });

      await service.update('semilla-1', { cultivo } as any);

      const [, update, unsetPaths] = repository.update.mock.calls[0];
      expect(update).toEqual({ cultivo });
      expect(unsetPaths).toEqual(
        expect.arrayContaining([
          'requerimientoFrio',
          'parametrosAgrometeorologicos.procesoTermico',
        ]),
      );
      expect(update.parametrosAgrometeorologicos).toBeUndefined();
    },
  );

  it.each(['Trigo', 'Cebada'])(
    'al cambiar Manzano a %s elimina dormancia_perenne si el payload no define proceso',
    async (cultivo) => {
      const { service, repository } = createSubject();
      repository.getById.mockResolvedValue({
        cultivo: 'Manzano',
        requerimientoFrio: { horasFrio: 600 },
        parametrosAgrometeorologicos: {
          version: 'agromet-test-1',
          temperaturaBaseC: 7,
          procesoTermico: 'dormancia_perenne',
        },
      });

      await service.update('semilla-1', { cultivo } as any);

      const [, update, unsetPaths] = repository.update.mock.calls[0];
      expect(update).toEqual({ cultivo });
      expect(unsetPaths).toEqual(
        expect.arrayContaining([
          'requerimientoFrio',
          'parametrosAgrometeorologicos.procesoTermico',
        ]),
      );
    },
  );

  it('al cambiar Trigo a Manzano elimina vernalizacion_anual y sus metadatos sin tocar otros parametros', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Trigo',
      parametrosAgrometeorologicos: parametrosMixtos(),
    });

    await service.update('semilla-1', {
      cultivo: 'Manzano',
      observaciones: 'Cambio a monte perenne',
    } as any);

    const [, update, unsetPaths] = repository.update.mock.calls[0];
    expect(update).toEqual({
      cultivo: 'Manzano',
      observaciones: 'Cambio a monte perenne',
    });
    expect(unsetPaths).toEqual(
      expect.arrayContaining([
        'parametrosAgrometeorologicos.procesoTermico',
        'parametrosAgrometeorologicos.rangoVernalizacionC',
        'parametrosAgrometeorologicos.requerimientoVernalizacion',
        'parametrosAgrometeorologicos.modeloVernalizacion',
        'parametrosAgrometeorologicos.habitoVernalizacion',
        'parametrosAgrometeorologicos.fuenteVernalizacion',
        'parametrosAgrometeorologicos.estadoVernalizacion',
      ]),
    );
    expect(update.parametrosAgrometeorologicos).toBeUndefined();
  });

  it('rechaza un proceso entrante incompatible y remueve el valor anterior', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Manzano',
      parametrosAgrometeorologicos: {
        version: 'agromet-test-1',
        procesoTermico: 'dormancia_perenne',
      },
    });

    await service.update('semilla-1', {
      parametrosAgrometeorologicos: {
        version: 'agromet-test-2',
        temperaturaBaseC: 7,
        procesoTermico: 'termico',
      },
    } as any);

    const [, update, unsetPaths] = repository.update.mock.calls[0];
    expect(update.parametrosAgrometeorologicos).toEqual({
      version: 'agromet-test-2',
      temperaturaBaseC: 7,
    });
    expect(unsetPaths).toContain(
      'parametrosAgrometeorologicos.procesoTermico',
    );
  });

  it('conserva vernalizacion en Arveja solo cuando el proceso varietal la activa', async () => {
    const { service, repository } = createSubject();

    await service.create({
      cultivo: 'Arveja',
      variedad: 'Arveja vernalizable',
      parametrosAgrometeorologicos: {
        ...parametrosMixtos(),
        procesoTermico: 'vernalizacion_anual',
      },
    } as any);
    await service.create({
      cultivo: 'Arveja',
      variedad: 'Arveja térmica',
      parametrosAgrometeorologicos: {
        ...parametrosMixtos(),
        procesoTermico: 'termico_fotoperiodico',
      },
    } as any);

    const activa = repository.create.mock.calls[0][0]
      .parametrosAgrometeorologicos;
    const inactiva = repository.create.mock.calls[1][0]
      .parametrosAgrometeorologicos;
    expect(activa.requerimientoVernalizacion).toBe(40);
    expect(activa.estadoVernalizacion).toBe('validado');
    expect(inactiva.procesoTermico).toBe('termico_fotoperiodico');
    expect(inactiva.requerimientoVernalizacion).toBeUndefined();
    expect(inactiva.estadoVernalizacion).toBeUndefined();
  });

  it('no arrastra vernalizacion de Trigo al cambiar a Arveja sin una nueva ficha explícita', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Trigo',
      parametrosAgrometeorologicos: parametrosMixtos(),
    });

    await service.update('semilla-1', {
      cultivo: 'Arveja',
      observaciones: 'Reclasificación varietal',
    } as any);

    const [, update, unsetPaths] = repository.update.mock.calls[0];
    expect(update).toEqual({
      cultivo: 'Arveja',
      observaciones: 'Reclasificación varietal',
    });
    expect(unsetPaths).toEqual(
      expect.arrayContaining([
        'parametrosAgrometeorologicos.procesoTermico',
        'parametrosAgrometeorologicos.requerimientoVernalizacion',
        'parametrosAgrometeorologicos.estadoVernalizacion',
      ]),
    );
  });

  it('convierte borrados explicitos del perfil termico en unset y preserva Kc', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Soja',
      parametrosAgrometeorologicos: {
        version: 'soja-2025',
        procesoTermico: 'termico_fotoperiodico',
        temperaturaBaseC: 8,
        semanticaGddPorEtapa:
          'rangos_acumulados_desde_inicio_termico',
        gddPorEtapa: {
          Floracion: { orden: 1, min: 500, max: 700 },
        },
        fotoperiodoVarietal: {
          modelo: 'umbral_por_etapa',
          estado: 'validado',
          fuente: 'Ensayo',
          porEtapa: {
            Floracion: {
              respuesta: 'dia_corto',
              umbralHoras: 13,
            },
          },
        },
        kcInicial: 0.4,
      },
    });

    await service.update('semilla-1', {
      parametrosAgrometeorologicos: {
        version: 'soja-2026',
        procesoTermico: 'termico_fotoperiodico',
        temperaturaBaseC: null,
        semanticaGddPorEtapa: null,
        gddPorEtapa: null,
        fotoperiodoVarietal: null,
        kcInicial: 0.45,
      },
    } as any);

    const [, update, unsetPaths] = repository.update.mock.calls[0];
    expect(update.parametrosAgrometeorologicos).toEqual({
      version: 'soja-2026',
      procesoTermico: 'termico_fotoperiodico',
      kcInicial: 0.45,
    });
    expect(unsetPaths).toEqual(
      expect.arrayContaining([
        'parametrosAgrometeorologicos.temperaturaBaseC',
        'parametrosAgrometeorologicos.semanticaGddPorEtapa',
        'parametrosAgrometeorologicos.gddPorEtapa',
        'parametrosAgrometeorologicos.fotoperiodoVarietal',
      ]),
    );
    expect(unsetPaths).not.toContain(
      'parametrosAgrometeorologicos.kcInicial',
    );
  });

  it('permite borrar valores de vernalizacion sin recuperar el dato anterior', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Trigo',
      parametrosAgrometeorologicos: parametrosMixtos(),
    });

    await service.update('semilla-1', {
      parametrosAgrometeorologicos: {
        procesoTermico: 'vernalizacion_anual',
        estadoVernalizacion: 'requiere_calibracion',
        habitoVernalizacion: 'desconocido',
        modeloVernalizacion: 'ventana_calibrada',
        requerimientoVernalizacion: null,
        rangoVernalizacionC: null,
        fuenteVernalizacion: null,
        ventanaVernalizacion: null,
        kcInicial: 0.5,
      },
    } as any);

    const [, update, unsetPaths] = repository.update.mock.calls[0];
    expect(update.parametrosAgrometeorologicos).toEqual({
      procesoTermico: 'vernalizacion_anual',
      estadoVernalizacion: 'requiere_calibracion',
      habitoVernalizacion: 'desconocido',
      modeloVernalizacion: 'ventana_calibrada',
      kcInicial: 0.5,
    });
    expect(unsetPaths).toEqual(
      expect.arrayContaining([
        'parametrosAgrometeorologicos.requerimientoVernalizacion',
        'parametrosAgrometeorologicos.rangoVernalizacionC',
        'parametrosAgrometeorologicos.fuenteVernalizacion',
        'parametrosAgrometeorologicos.ventanaVernalizacion',
      ]),
    );
  });

  it('no persiste null cientificos al crear una variedad', async () => {
    const { service, repository } = createSubject();

    await service.create({
      cultivo: 'Manzano',
      requerimientoFrio: {
        horasFrio: null,
        porcionesFrio: 55,
        fuente: null,
      },
      parametrosAgrometeorologicos: {
        version: 'maiz-borrador',
        estado: 'requiere_calibracion',
        temperaturaBaseC: null,
        gddPorEtapa: null,
        fotoperiodoVarietal: null,
        kcInicial: 0.35,
      },
    } as any);

    expect(repository.create.mock.calls[0][0].requerimientoFrio).toEqual({
      porcionesFrio: 55,
    });
    expect(
      repository.create.mock.calls[0][0].parametrosAgrometeorologicos,
    ).toEqual({
      version: 'maiz-borrador',
      estado: 'requiere_calibracion',
      kcInicial: 0.35,
    });
  });

  it('rechaza un perfil termico declarado validado si le faltan parametros cientificos obligatorios', async () => {
    const { service, repository } = createSubject();

    await expect(
      service.create({
        cultivo: 'Soja',
        variedad: 'Variedad incompleta',
        parametrosAgrometeorologicos: {
          version: 'incompleto-1',
          estado: 'validado',
          fuente: 'Ensayo parcial',
          procesoTermico: 'termico_fotoperiodico',
          temperaturaBaseC: 8,
        },
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('no admite estados cientificos validados para un cultivo fuera de la matriz canonica', async () => {
    const { service, repository } = createSubject();

    await expect(
      service.create({
        cultivo: 'Cultivo inventado',
        variedad: 'Variedad X',
        parametrosAgrometeorologicos: perfilTermicoValidado(),
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('no admite evidencia cientifica varietal validada sin identificar la variedad', async () => {
    const { service, repository } = createSubject();

    await expect(
      service.create({
        cultivo: 'Soja',
        parametrosAgrometeorologicos: perfilTermicoValidado(),
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('permite validar el perfil termico sin exigir que el fotoperiodo no declarado validado este completo', async () => {
    const { service, repository } = createSubject();

    await service.create({
      cultivo: 'Soja',
      variedad: 'Perfil termico aislado',
      parametrosAgrometeorologicos: {
        ...perfilTermicoValidado(),
        fotoperiodoVarietal: {
          modelo: 'umbral_por_etapa',
          estado: 'requiere_calibracion',
          porEtapa: {},
        },
      },
    } as any);

    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('valida cada elemento del alta masiva antes de escribir', async () => {
    const { service, repository } = createSubject();

    await expect(
      service.bulk([
        {
          cultivo: 'Maiz',
          variedad: 'Fotoperiodo sin evidencia',
          parametrosAgrometeorologicos: {
            version: 'foto-incompleto-1',
            procesoTermico: 'termico_fotoperiodico',
            fotoperiodoVarietal: {
              modelo: 'umbral_por_etapa',
              estado: 'validado',
              porEtapa: {},
            },
          },
        },
      ] as any),
    ).rejects.toThrow(BadRequestException);

    expect(repository.bulk).not.toHaveBeenCalled();
  });

  it('valida el estado efectivo del update y no permite borrar una pieza de un perfil que sigue validado', async () => {
    const { service, repository } = createSubject();
    repository.getById.mockResolvedValue({
      cultivo: 'Soja',
      variedad: 'Perfil vigente',
      parametrosAgrometeorologicos: perfilTermicoValidado(),
    });

    await expect(
      service.update('semilla-1', {
        parametrosAgrometeorologicos: {
          temperaturaSuperiorC: null,
        },
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('acepta vernalizacion validada aunque el perfil GDD y el fotoperiodo permanezcan como referencia', async () => {
    const { service, repository } = createSubject();

    await service.create({
      cultivo: 'Trigo',
      variedad: 'Primaveral documentada',
      parametrosAgrometeorologicos: {
        ...parametrosMixtos(),
        estado: 'referencia',
        fotoperiodoVarietal: {
          modelo: 'umbral_por_etapa',
          estado: 'referencia',
          porEtapa: {},
        },
      },
    } as any);

    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('rechaza vernalizacion validada si la ventana fenologica no esta definida', async () => {
    const { service, repository } = createSubject();

    await expect(
      service.create({
        cultivo: 'Trigo',
        variedad: 'Vernalizacion incompleta',
        parametrosAgrometeorologicos: {
          ...parametrosMixtos(),
          ventanaVernalizacion: undefined,
        },
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rechaza frio o protocolo estacional falsamente declarados como validados', async () => {
    const { service, repository } = createSubject();

    await expect(
      service.create({
        cultivo: 'Manzano',
        variedad: 'Frio incompleto',
        requerimientoFrio: {
          estado: 'validado',
          modeloRector: 'HF',
          horasFrio: 600,
        },
        parametrosAgrometeorologicos: {
          version: 'dormancia-1',
          procesoTermico: 'dormancia_perenne',
        },
      } as any),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create({
        cultivo: 'Manzano',
        variedad: 'Protocolo incompleto',
        requerimientoFrio: {
          estado: 'referencia',
          modeloRector: 'HF',
          horasFrio: 600,
          protocoloTemporada: {
            version: 'protocolo-1',
            estado: 'validado',
            fuente: 'Ensayo regional',
            inicio: { tipo: 'fecha_calendario', mesDia: '05-01' },
            fin: { tipo: 'fecha_calendario', mesDia: '08-01' },
          },
        },
        parametrosAgrometeorologicos: {
          version: 'dormancia-1',
          procesoTermico: 'dormancia_perenne',
        },
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });
});
