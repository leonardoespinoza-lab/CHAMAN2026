import { CrearEditarSemillasComponent } from './crear-editar-semillas.component';

describe('CrearEditarSemillasComponent clasificación térmica', () => {
  function createComponent(semilla?: any) {
    const service = {
      crear: jasmine.createSpy('crear').and.callFake(async (data: any) => ({
        _id: 'semilla-creada',
        ...data,
      })),
      editar: jasmine.createSpy('editar').and.resolveTo(undefined),
    };
    const listado = {
      createEntityItem: jasmine.createSpy('createEntityItem'),
      patchEntityItem: jasmine.createSpy('patchEntityItem'),
    };
    const router = {
      navigate: jasmine.createSpy('navigate').and.resolveTo(true),
    };
    const helper = {
      notifSuccess: jasmine.createSpy('notifSuccess'),
      notifError: jasmine.createSpy('notifError'),
    };
    const component = new CrearEditarSemillasComponent(
      { get: () => undefined } as any,
      { instant: (value: string) => value } as any,
      service as any,
      helper as any,
      router as any,
      listado as any
    );

    component.semilla = semilla;
    (component as any).createForm();
    return { component, service, listado };
  }

  function completarDatosBase(component: CrearEditarSemillasComponent, cultivo: string): void {
    component.form?.patchValue({
      semillero: 'Semillero de prueba',
      cultivo,
      variedad: 'Variedad de prueba',
      ciclo: 'GENERAL',
    });
  }

  it('muestra dormancia para perennes, vernalización obligatoria en cereales y opcional en Arveja', () => {
    const { component } = createComponent();

    component.form?.get('cultivo')?.setValue('Manzano');
    expect(component.esCultivoPerenneSeleccionado).toBeTrue();
    expect(component.usaVernalizacionSeleccionada).toBeFalse();

    component.form?.get('cultivo')?.setValue('Trigo');
    expect(component.esCultivoPerenneSeleccionado).toBeFalse();
    expect(component.usaVernalizacionSeleccionada).toBeTrue();

    component.form?.get('cultivo')?.setValue('Cebada');
    expect(component.esCultivoPerenneSeleccionado).toBeFalse();
    expect(component.usaVernalizacionSeleccionada).toBeTrue();

    component.form?.get('cultivo')?.setValue('Arveja');
    expect(component.permiteVernalizacionSeleccionada).toBeTrue();
    expect(component.usaVernalizacionSeleccionada).toBeFalse();
    component.form
      ?.get('requerimientoVernalizacion.activada')
      ?.setValue(true);
    expect(component.usaVernalizacionSeleccionada).toBeTrue();

    component.form?.get('cultivo')?.setValue('Soja');
    expect(component.esCultivoPerenneSeleccionado).toBeFalse();
    expect(component.permiteVernalizacionSeleccionada).toBeFalse();
    expect(component.usaVernalizacionSeleccionada).toBeFalse();
  });

  it('serializa frío en perennes y no duplica vernalización fuera de parametrosAgrometeorologicos', async () => {
    const { component, service } = createComponent();
    completarDatosBase(component, 'Manzano');
    component.form?.get('requerimientoFrio')?.patchValue({
      horasFrio: 900,
      modeloRector: 'HF',
      estado: 'validado',
      fuente: 'Ficha varietal validada',
      protocoloTemporada: {
        version: 'alto-valle-manzano-1.0',
        estado: 'validado',
        fuente: 'Protocolo regional documentado',
        region: 'Alto Valle de Rio Negro y Neuquen',
        inicioTipo: 'biofix',
        finTipo: 'fecha_calendario',
        finMesDia: '09-15',
        observaciones: 'Biofix de inicio confirmado a campo.',
      },
    });
    component.form?.get('requerimientoVernalizacion')?.patchValue({
      habito: 'invernal',
      modelo: 'ventana_calibrada',
      requisito: 45,
      fuente: 'No debe persistirse',
      estado: 'validado',
    });

    await component.guardar();

    const payload = service.crear.calls.mostRecent().args[0];
    expect(payload.requerimientoFrio).toEqual(
      jasmine.objectContaining({
        horasFrio: 900,
        modeloRector: 'HF',
        estado: 'validado',
        protocoloTemporada: {
          version: 'alto-valle-manzano-1.0',
          estado: 'validado',
          fuente: 'Protocolo regional documentado',
          region: 'Alto Valle de Rio Negro y Neuquen',
          inicio: {
            tipo: 'biofix',
            objetivo: 'inicio_acumulacion_frio',
          },
          fin: {
            tipo: 'fecha_calendario',
            mesDia: '09-15',
          },
          observaciones: 'Biofix de inicio confirmado a campo.',
        },
      })
    );
    expect(payload.parametrosAgrometeorologicos).toEqual(
      jasmine.objectContaining({
        procesoTermico: 'dormancia_perenne',
        estado: 'requiere_calibracion',
        metodoGdd: 'promedio_limitado',
      })
    );
    expect(payload.parametrosAgrometeorologicos?.requerimientoVernalizacion).toBeUndefined();
    expect(payload.requerimientoVernalizacion).toBeUndefined();
  });

  it('serializa vernalización de Trigo en parametrosAgrometeorologicos y omite frío', async () => {
    const { component, service } = createComponent();
    completarDatosBase(component, 'Trigo');
    component.form?.get('requerimientoFrio')?.patchValue({
      horasFrio: 900,
      modeloRector: 'HF',
      estado: 'validado',
      fuente: 'No debe persistirse',
    });
    component.form?.get('requerimientoVernalizacion')?.patchValue({
      habito: 'invernal',
      modelo: 'ventana_calibrada',
      requisito: 45,
      fuente: 'Ensayo varietal validado',
      estado: 'validado',
      inicioEtapa: 'Emergencia',
      finEtapa: 'Espiguilla Terminal',
    });

    await component.guardar();

    const payload = service.crear.calls.mostRecent().args[0];
    expect(payload.requerimientoFrio).toBeUndefined();
    expect(payload.requerimientoVernalizacion).toBeUndefined();
    expect(payload.parametrosAgrometeorologicos).toEqual(
      jasmine.objectContaining({
        procesoTermico: 'vernalizacion_anual',
        habitoVernalizacion: 'invernal',
        modeloVernalizacion: 'ventana_calibrada',
        requerimientoVernalizacion: 45,
        fuenteVernalizacion: 'Ensayo varietal validado',
        estadoVernalizacion: 'validado',
        ventanaVernalizacion: {
          inicioEtapa: 'Emergencia',
          finEtapa: 'Espiguilla Terminal',
          unidad: 'dias_equivalentes',
        },
      })
    );
    expect(payload.parametrosAgrometeorologicos?.estado).toBe(
      'requiere_calibracion'
    );
  });

  it('no serializa ni frío ni vernalización para un anual no vernalizable', async () => {
    const { component, service } = createComponent();
    completarDatosBase(component, 'Soja');
    component.form?.get('requerimientoFrio')?.patchValue({
      horasFrio: 900,
      modeloRector: 'HF',
      estado: 'validado',
      fuente: 'No debe persistirse',
    });
    component.form?.get('requerimientoVernalizacion')?.patchValue({
      habito: 'invernal',
      modelo: 'ventana_calibrada',
      requisito: 45,
      fuente: 'No debe persistirse',
      estado: 'validado',
    });

    await component.guardar();

    const payload = service.crear.calls.mostRecent().args[0];
    expect(payload.requerimientoFrio).toBeUndefined();
    expect(payload.requerimientoVernalizacion).toBeUndefined();
    expect(payload.parametrosAgrometeorologicos?.requerimientoVernalizacion).toBeUndefined();
    expect(payload.parametrosAgrometeorologicos?.procesoTermico).toBe(
      'termico_fotoperiodico'
    );
  });

  it('solo serializa vernalización de Arveja cuando la variedad la declara explícitamente', async () => {
    const { component, service } = createComponent();
    completarDatosBase(component, 'Arveja');
    component.form?.get('requerimientoVernalizacion')?.patchValue({
      activada: true,
      habito: 'facultativo',
      modelo: 'ventana_calibrada',
      requisito: 18,
      temperaturaMinC: 1,
      temperaturaMaxC: 10,
      fuente: 'Ensayo varietal de Pisum sativum',
      estado: 'referencia',
      inicioEtapa: 'Emergencia',
      finEtapa: 'Iniciacion Floral',
    });

    await component.guardar();

    const payload = service.crear.calls.mostRecent().args[0];
    expect(payload.requerimientoFrio).toBeUndefined();
    expect(payload.parametrosAgrometeorologicos).toEqual(
      jasmine.objectContaining({
        procesoTermico: 'vernalizacion_anual',
        habitoVernalizacion: 'facultativo',
        requerimientoVernalizacion: 18,
        rangoVernalizacionC: { min: 1, max: 10 },
        estadoVernalizacion: 'referencia',
        ventanaVernalizacion: {
          inicioEtapa: 'Emergencia',
          finEtapa: 'Iniciacion Floral',
          unidad: 'dias_equivalentes',
        },
      })
    );
  });

  it('serializa un perfil térmico y fotoperiódico auditable sin convertir rangos', async () => {
    const { component, service } = createComponent();
    completarDatosBase(component, 'Maiz');
    component.form?.get('parametrosTermicos')?.patchValue({
      version: 'maiz-hibrido-2026-v1',
      estado: 'validado',
      fuente: 'Ensayo oficial por etapas 2025/2026',
      temperaturaBaseC: 8,
      temperaturaSuperiorC: 34,
      profundidadRadicularCm: 120,
      fotoperiodo: {
        estado: 'validado',
        fuente: 'Ensayo fotoperiodico del hibrido',
      },
    });
    component.agregarEtapaGdd();
    component.gddEtapas.at(0).patchValue({
      etapa: 'Emergencia',
      orden: 1,
      min: 0,
      max: 99,
    });
    component.agregarEtapaGdd();
    component.gddEtapas.at(1).patchValue({
      etapa: 'Floracion',
      orden: 2,
      min: 100,
      max: 850,
    });
    component.agregarEtapaFotoperiodo();
    component.fotoperiodoEtapas.at(0).patchValue({
      etapa: 'Floracion',
      respuesta: 'dia_largo',
      umbralHoras: 13.5,
    });

    await component.guardar();

    const payload = service.crear.calls.mostRecent().args[0];
    expect(payload.parametrosAgrometeorologicos).toEqual(
      jasmine.objectContaining({
        version: 'maiz-hibrido-2026-v1',
        estado: 'validado',
        fuente: 'Ensayo oficial por etapas 2025/2026',
        procesoTermico: 'termico_fotoperiodico',
        temperaturaBaseC: 8,
        temperaturaSuperiorC: 34,
        metodoGdd: 'promedio_limitado',
        semanticaGddPorEtapa:
          'rangos_acumulados_desde_inicio_termico',
        profundidadRadicularCm: 120,
        gddPorEtapa: {
          Emergencia: { orden: 1, min: 0, max: 99 },
          Floracion: { orden: 2, min: 100, max: 850 },
        },
        fotoperiodoVarietal: {
          modelo: 'umbral_por_etapa',
          estado: 'validado',
          fuente: 'Ensayo fotoperiodico del hibrido',
          porEtapa: {
            Floracion: {
              respuesta: 'dia_largo',
              umbralHoras: 13.5,
            },
          },
        },
      })
    );
  });

  it('al borrar las etapas envia borrados explicitos y conserva otros parametros', async () => {
    const { component, service } = createComponent({
      _id: 'semilla-soja',
      semillero: 'Semillero',
      cultivo: 'Soja',
      variedad: 'Variedad',
      ciclo: 'GENERAL',
      parametrosAgrometeorologicos: {
        version: 'soja-2025',
        estado: 'validado',
        fuente: 'Ensayo 2025',
        procesoTermico: 'termico_fotoperiodico',
        temperaturaBaseC: 8,
        temperaturaSuperiorC: 35,
        metodoGdd: 'promedio_limitado',
        semanticaGddPorEtapa:
          'rangos_acumulados_desde_inicio_termico',
        gddPorEtapa: {
          Floracion: { orden: 1, min: 500, max: 700 },
        },
        fotoperiodoVarietal: {
          modelo: 'umbral_por_etapa',
          estado: 'validado',
          fuente: 'Ensayo 2025',
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
    component.borrarEtapaGdd(0);
    component.borrarEtapaFotoperiodo(0);
    component.form?.get('parametrosTermicos')?.patchValue({
      fuente: '',
      temperaturaBaseC: null,
      temperaturaSuperiorC: null,
    });

    await component.guardar();

    const payload = service.editar.calls.mostRecent().args[1];
    expect(payload.parametrosAgrometeorologicos).toEqual(
      jasmine.objectContaining({
        fuente: null,
        temperaturaBaseC: null,
        temperaturaSuperiorC: null,
        semanticaGddPorEtapa: null,
        gddPorEtapa: null,
        fotoperiodoVarietal: null,
        kcInicial: 0.4,
      }),
    );
  });

  it('al cambiar cultivo limpia frio GDD y fotoperiodo del perfil anterior', async () => {
    const { component, service } = createComponent({
      _id: 'semilla-manzano',
      semillero: 'Vivero',
      cultivo: 'Manzano',
      variedad: 'Variedad anterior',
      ciclo: 'GENERAL',
      requerimientoFrio: {
        horasFrio: 900,
        porcionesFrio: 55,
        modeloRector: 'CP',
        estado: 'validado',
        fuente: 'Ficha anterior',
      },
      parametrosAgrometeorologicos: {
        version: 'manzano-2025',
        estado: 'validado',
        fuente: 'Ficha anterior',
        procesoTermico: 'dormancia_perenne',
        temperaturaBaseC: 4,
        metodoGdd: 'promedio_limitado',
        semanticaGddPorEtapa:
          'rangos_acumulados_desde_inicio_termico',
        gddPorEtapa: {
          Brotacion: { orden: 1, min: 100, max: 200 },
        },
        kcInicial: 0.5,
      },
    });

    component.form?.get('cultivo')?.setValue('Peral');
    expect(component.gddEtapas.length).toBe(0);
    expect(
      component.form?.get('requerimientoFrio.horasFrio')?.value,
    ).toBeNull();
    expect(
      component.form?.get('parametrosTermicos.temperaturaBaseC')?.value,
    ).toBeNull();

    await component.guardar();

    const payload = service.editar.calls.mostRecent().args[1];
    expect(payload.requerimientoFrio.horasFrio).toBeUndefined();
    expect(payload.requerimientoFrio.porcionesFrio).toBeUndefined();
    expect(payload.requerimientoFrio.fuente).toBeUndefined();
    expect(payload.parametrosAgrometeorologicos).toEqual(
      jasmine.objectContaining({
        fuente: null,
        temperaturaBaseC: null,
        semanticaGddPorEtapa: null,
        gddPorEtapa: null,
        fotoperiodoVarietal: null,
        kcInicial: 0.5,
        procesoTermico: 'dormancia_perenne',
      }),
    );
  });
});
