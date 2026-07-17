import {
  Cultivo,
  MATRIZ_CLASIFICACION_TERMICA_CULTIVOS,
  evaluarEvidenciaTermicaVarietal,
  getClasificacionTermicaCultivo,
} from 'modelos/src';

describe('Matriz de clasificación térmica de cultivos', () => {
  const cultivos: Cultivo[] = [
    'Soja',
    'Trigo',
    'Maiz',
    'Papa',
    'Cebada',
    'Arveja',
    'Vid',
    'Peral',
    'Pecan',
    'Manzano',
  ];
  const perennes: Cultivo[] = ['Vid', 'Peral', 'Pecan', 'Manzano'];
  const cerealesVernalizables: Cultivo[] = ['Trigo', 'Cebada'];
  const anualesTermicoFotoperiodicos: Cultivo[] = [
    'Soja',
    'Maiz',
    'Papa',
    'Arveja',
  ];

  it('clasifica los diez cultivos soportados y documenta límites y fuentes', () => {
    expect(Object.keys(MATRIZ_CLASIFICACION_TERMICA_CULTIVOS).sort()).toEqual(
      [...cultivos].sort()
    );

    for (const cultivo of cultivos) {
      const clasificacion = getClasificacionTermicaCultivo(cultivo);
      expect(clasificacion).toBeDefined();
      expect(clasificacion?.cultivo).toBe(cultivo);
      expect(clasificacion?.fuentes.length).toBeGreaterThan(0);
      expect(clasificacion?.noCalcular.length).toBeGreaterThan(0);
    }
  });

  it('reserva HF y CP para dormancia perenne y nunca habilita HFE como modelo rector', () => {
    for (const cultivo of perennes) {
      const clasificacion = getClasificacionTermicaCultivo(cultivo);
      expect(clasificacion?.procesoPrincipal).toBe('dormancia_perenne');
      expect(clasificacion?.unidadesValidas).toContain('HF');
      expect(clasificacion?.unidadesValidas).toContain('CP');
      expect(clasificacion?.unidadesValidas).not.toContain('HFE');
    }
  });

  it('separa vernalización cereal de dormancia y del desarrollo térmico-fotoperiódico', () => {
    for (const cultivo of cerealesVernalizables) {
      const clasificacion = getClasificacionTermicaCultivo(cultivo);
      expect(clasificacion?.procesoPrincipal).toBe('vernalizacion_cereal');
      expect(clasificacion?.unidadesValidas).toContain('VU');
      expect(clasificacion?.unidadesValidas).not.toContain('HF');
      expect(clasificacion?.unidadesValidas).not.toContain('CP');
    }

    for (const cultivo of anualesTermicoFotoperiodicos) {
      const clasificacion = getClasificacionTermicaCultivo(cultivo);
      expect(clasificacion?.procesoPrincipal).toBe('termico_fotoperiodico');
      expect(clasificacion?.unidadesValidas).not.toContain('HF');
      expect(clasificacion?.unidadesValidas).not.toContain('CP');
      expect(clasificacion?.unidadesValidas).not.toContain('VU');
    }
  });

  it('no habilita una predicción perenne con HFE legacy ni sin fuente varietal', () => {
    const evaluacion = evaluarEvidenciaTermicaVarietal({
      cultivo: 'Manzano',
      variedad: 'Variedad sin validar',
      requerimientoFrio: {
        horasFrioEfectivas: 738,
        modelo: 'HFE',
        estado: 'validado',
      },
    });

    expect(evaluacion.aptoParaPrediccionAutomatica).toBeFalse();
    expect(evaluacion.estado).toBe('requiere_calibracion_varietal');
    expect(evaluacion.faltantes.length).toBeGreaterThan(0);
  });

  it('valida el perfil perenne pero exige biofix de campo antes de automatizar la etapa', () => {
    const evaluacion = evaluarEvidenciaTermicaVarietal({
      cultivo: 'Manzano',
      variedad: 'Variedad documentada',
      requerimientoFrio: {
        horasFrio: 900,
        modelo: 'HF + Dynamic Model',
        modeloRector: 'HF',
        estado: 'validado',
        fuente: 'Ficha varietal validada',
        protocoloTemporada: {
          version: 'alto-valle-v1',
          estado: 'validado',
          fuente: 'Protocolo regional documentado',
          region: 'Alto Valle de Rio Negro y Neuquen',
          inicio: {
            tipo: 'fecha_calendario',
            mesDia: '05-01',
          },
          fin: {
            tipo: 'biofix',
            objetivo: 'fin_acumulacion_frio',
          },
        },
      },
      parametrosAgrometeorologicos: {
        version: 'thermal-matrix-v1',
        procesoTermico: 'dormancia_perenne',
        estado: 'validado',
        fuente: 'Ensayo varietal de forzado',
        temperaturaBaseC: 4.5,
        temperaturaSuperiorC: 30,
        metodoGdd: 'promedio_limitado',
        semanticaGddPorEtapa:
          'rangos_acumulados_desde_inicio_termico',
        gddPorEtapa: {
          Brotacion: { orden: 1, min: 0, max: 139 },
          Floracion: { orden: 2, min: 140, max: 400 },
        },
      },
    });

    expect(evaluacion.perfilVarietalValidado).toBeTrue();
    expect(evaluacion.requiereBiofixCampo).toBeTrue();
    expect(evaluacion.aptoParaPrediccionAutomatica).toBeFalse();
    expect(evaluacion.estado).toBe(
      'perfil_varietal_validado_requiere_biofix'
    );
    expect(evaluacion.faltantes).toContain(
      'biofix fenológico observado en el lote'
    );
  });

  it('separa el estado de vernalización y no declara completo un cereal sin fotoperíodo', () => {
    const incompleta = evaluarEvidenciaTermicaVarietal({
      cultivo: 'Trigo',
      variedad: 'Sin calibrar',
      parametrosAgrometeorologicos: {
        version: 'thermal-matrix-v1',
        procesoTermico: 'vernalizacion_anual',
        estadoVernalizacion: 'requiere_calibracion',
        habitoVernalizacion: 'desconocido',
      },
    });
    const completa = evaluarEvidenciaTermicaVarietal({
      cultivo: 'Trigo',
      variedad: 'Variedad documentada',
      parametrosAgrometeorologicos: {
        version: 'thermal-matrix-v1',
        procesoTermico: 'vernalizacion_anual',
        estadoVernalizacion: 'validado',
        habitoVernalizacion: 'invernal',
        modeloVernalizacion: 'ventana_calibrada',
        requerimientoVernalizacion: 45,
        rangoVernalizacionC: { min: 0, max: 15 },
        fuenteVernalizacion: 'Ensayo varietal validado',
        ventanaVernalizacion: {
          inicioEtapa: 'Emergencia',
          finEtapa: 'Espiguilla Terminal',
          unidad: 'dias_equivalentes',
        },
        estado: 'validado',
        fuente: 'Ensayo de fases térmicas',
        temperaturaBaseC: 0,
        temperaturaSuperiorC: 30,
        metodoGdd: 'promedio_limitado',
        semanticaGddPorEtapa:
          'rangos_acumulados_desde_inicio_termico',
        gddPorEtapa: {
          Emergencia: { orden: 1, min: 0, max: 149 },
          Espiguilla_Terminal: { orden: 2, min: 150, max: 699 },
          Espigazon: { orden: 3, min: 700, max: 1100 },
        },
      },
    });

    expect(incompleta.aptoParaPrediccionAutomatica).toBeFalse();
    expect(incompleta.estado).toBe('requiere_calibracion_varietal');
    expect(incompleta.faltantes.length).toBeGreaterThan(0);
    expect(completa.aptoParaPrediccionAutomatica).toBeFalse();
    expect(completa.estado).toBe('requiere_calibracion_varietal');
    expect(completa.faltantes).toContain(
      'modelo fotoperiódico varietal implementado'
    );
    expect(completa.faltantes).toContain(
      'fuente fotoperiódica varietal'
    );
  });

  it('admite un cereal primaveral documentado con requisito explícito igual a cero', () => {
    const evaluacion = evaluarEvidenciaTermicaVarietal({
      cultivo: 'Trigo',
      variedad: 'Primaveral documentado',
      parametrosAgrometeorologicos: {
        version: 'thermal-matrix-v1',
        procesoTermico: 'vernalizacion_anual',
        estadoVernalizacion: 'validado',
        habitoVernalizacion: 'primaveral',
        requerimientoVernalizacion: 0,
        fuenteVernalizacion: 'Ensayo varietal que confirma hábito primaveral',
        estado: 'validado',
        fuente: 'Ensayo de fases térmicas',
        temperaturaBaseC: 0,
        temperaturaSuperiorC: 30,
        metodoGdd: 'promedio_limitado',
        semanticaGddPorEtapa:
          'rangos_acumulados_desde_inicio_termico',
        gddPorEtapa: {
          Emergencia: { orden: 1, min: 0, max: 149 },
          Macollaje: { orden: 2, min: 150, max: 699 },
          Espigazon: { orden: 3, min: 700, max: 1100 },
        },
        fotoperiodoVarietal: {
          modelo: 'umbral_por_etapa',
          estado: 'validado',
          fuente: 'Ensayo fotoperiódico varietal',
          porEtapa: {
            Emergencia: { respuesta: 'neutra' },
            Macollaje: { respuesta: 'neutra' },
            Espigazon: { respuesta: 'neutra' },
          },
        },
      },
    });

    expect(evaluacion.perfilVarietalValidado).toBeTrue();
    expect(evaluacion.aptoParaPrediccionAutomatica).toBeTrue();
    expect(evaluacion.faltantes).not.toContain(
      'requisito positivo de ventana calibrada'
    );
    expect(evaluacion.faltantes).not.toContain(
      'ventana fenológica explícita de vernalización'
    );
  });

  it('rechaza perfiles GDD desordenados o fotoperiodos sin umbral operativo', () => {
    const evaluacion = evaluarEvidenciaTermicaVarietal({
      cultivo: 'Maiz',
      variedad: 'Perfil inconsistente',
      parametrosAgrometeorologicos: {
        version: 'thermal-matrix-v1',
        procesoTermico: 'termico_fotoperiodico',
        estado: 'validado',
        fuente: 'Ensayo varietal',
        temperaturaBaseC: 8,
        temperaturaSuperiorC: 34,
        metodoGdd: 'promedio_limitado',
        semanticaGddPorEtapa:
          'rangos_acumulados_desde_inicio_termico',
        gddPorEtapa: {
          Emergencia: { orden: 1, min: 100, max: 200 },
          Floracion: { orden: 2, min: 80, max: 700 },
        },
        fotoperiodoVarietal: {
          modelo: 'umbral_por_etapa',
          estado: 'validado',
          fuente: 'Ensayo fotoperiodico',
          porEtapa: {
            Floracion: {
              respuesta: 'dia_largo',
            },
          },
        },
      },
    });

    expect(evaluacion.aptoParaPrediccionAutomatica).toBeFalse();
    expect(evaluacion.faltantes).toContain(
      'secuencia GDD acumulada monotónica por etapa'
    );
    expect(evaluacion.faltantes).toContain(
      'respuesta y umbral fotoperiódico válidos por etapa'
    );
  });

  it('no hereda el estado global para validar vernalización', () => {
    const evaluacion = evaluarEvidenciaTermicaVarietal({
      cultivo: 'Cebada',
      variedad: 'Legacy global',
      parametrosAgrometeorologicos: {
        version: 'thermal-matrix-v1',
        procesoTermico: 'vernalizacion_anual',
        estado: 'validado',
        fuente: 'Perfil térmico general',
        temperaturaBaseC: 0,
        temperaturaSuperiorC: 30,
        gddPorEtapa: { Espigazon: { objetivo: 1000 } },
        habitoVernalizacion: 'invernal',
        modeloVernalizacion: 'ventana_calibrada',
        requerimientoVernalizacion: 40,
        rangoVernalizacionC: { min: 0, max: 12 },
        fuenteVernalizacion: 'Ensayo varietal',
      },
    });

    expect(evaluacion.faltantes).toContain(
      'estado de vernalización validado'
    );
  });

  it('admite vernalización opcional de Arveja solo como calibración varietal propia', () => {
    const clasificacion = getClasificacionTermicaCultivo('Arveja');
    const evaluacion = evaluarEvidenciaTermicaVarietal({
      cultivo: 'Arveja',
      variedad: 'Genotipo facultativo',
      parametrosAgrometeorologicos: {
        version: 'thermal-matrix-v1',
        procesoTermico: 'vernalizacion_anual',
        estadoVernalizacion: 'referencia',
        habitoVernalizacion: 'facultativo',
        modeloVernalizacion: 'ventana_calibrada',
        requerimientoVernalizacion: 18,
        rangoVernalizacionC: { min: 1, max: 10 },
        fuenteVernalizacion: 'Ensayo específico de Pisum sativum',
      },
    });

    expect(clasificacion?.respuestaVernalizacionOpcional).toBeTrue();
    expect(clasificacion?.unidadesValidas).toContain(
      'dias_ventana_calibrada'
    );
    expect(clasificacion?.unidadesValidas).not.toContain('HF');
    expect(clasificacion?.unidadesValidas).not.toContain('CP');
    expect(evaluacion.aptoParaPrediccionAutomatica).toBeFalse();
    expect(evaluacion.faltantes).toContain(
      'estado de vernalización validado'
    );
  });
});
