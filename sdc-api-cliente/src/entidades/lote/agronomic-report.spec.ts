import {
  IReporteNDVI,
  ISiembra,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import { LotesService } from './service';

describe('LotesService - seguimiento satelital del informe agronomico', () => {
  const service = new LotesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  ) as any;

  const siembra: ISiembra = {
    fechaSiembra: '2026-07-01T00:00:00.000Z',
    semilla: { cultivo: 'Arveja', variedad: 'KINGFISHER' },
    crono: {
      etapas: {
        siembra_emergencia: 8,
        emergencia_vegetativo: 24,
        vegetativo_floracion: 30,
      },
    } as any,
  };

  const reportes: IReporteNDVI[] = [
    {
      fechaDeLaImagen: '2026-07-08T00:00:00.000Z',
      indices: { ndvi: 0.513, ndre: 0.24 },
      coleccion: 'sentinel-2-l2a',
      metadataImagen: {
        renderVersion: 'fixed-index-v3',
        renderQa: { ndvi: { status: 'ok', validCoveragePct: 92 } },
        qualityMask: { validCoveragePct: 92 },
      } as any,
    },
    {
      fechaDeLaImagen: '2026-07-12T00:00:00.000Z',
      indices: { ndvi: 0.527, evi: 0.41 },
      coleccion: 'sentinel-2-l2a',
      metadataImagen: {
        renderVersion: 'fixed-index-v3',
        renderQa: { ndvi: { status: 'ok', validCoveragePct: 88 } },
        qualityMask: { validCoveragePct: 88 },
      } as any,
    },
  ];

  it('mantiene una escala NDVI fija y muestra fecha, dia de ciclo y valor real', () => {
    const html = service.renderNdviSparkline(reportes, siembra);

    expect(html).toContain('escala fija 0-1');
    expect(html).toContain('D+7');
    expect(html).toContain('D+11');
    expect(html).toContain('0,513');
    expect(html).toContain('0,527');
    expect(html).toContain('+0,014');
    expect(html).toContain('Etapa en ultima escena');
  });

  it('prioriza una etapa fenologica registrada a campo para la fecha de escena', () => {
    const conRegistro: ISiembra = {
      ...siembra,
      registrosFenologicos: [
        {
          fecha: '2026-07-10T00:00:00.000Z',
          etapa: 'V3 - tercer nudo',
        },
      ],
    };

    const puntos = service.getPuntosNdviCertificado(reportes, conRegistro);

    expect(puntos[0].etapaConfirmada).toBe(false);
    expect(puntos[1]).toMatchObject({
      etapa: 'V3 - tercer nudo',
      etapaFuente: 'Inicio de etapa de campo · confianza media',
      etapaConfirmada: true,
    });
  });

  it('expone trazabilidad, calidad y los indices complementarios sin mezclarlos', () => {
    const html = service.renderTablaSatelital(reportes, siembra);

    expect(html).toContain('Trazabilidad de escenas');
    expect(html).toContain('92% valida');
    expect(html).toContain('Indices complementarios por escena');
    expect(html).toContain('<th>NDRE</th>');
    expect(html).toContain('<th>EVI</th>');
    expect(html).toContain('sentinel-2-l2a');
  });

  it('descarta fechas inutiles y valores fuera del rango normalizado', () => {
    const puntos = service.getPuntosNdviCertificado(
      [
        { fechaDeLaImagen: 'invalida', indices: { ndvi: 0.5 } },
        {
          fechaDeLaImagen: '2026-07-10T00:00:00.000Z',
          indices: { ndvi: 1.4 },
        },
        {
          fechaDeLaImagen: '2026-06-30T00:00:00.000Z',
          indices: { ndvi: 0.5 },
        },
      ],
      siembra,
    );

    expect(puntos).toEqual([]);
  });

  it('no presenta un cero sin estado valido como agua util real', () => {
    const sinDato = {
      aguaUtilReal: 0,
      estadoCalculoAguaUtil: 'no_disponible',
    } as ISiembra;
    const calculado = {
      aguaUtilReal: 18.4,
      estadoCalculoAguaUtil: 'calculado',
    } as ISiembra;

    expect(service.getRiegoTexto(sinDato)).toBe('Sin recomendacion');
    expect(service.getRiegoScore(sinDato)).toBe(0);
    expect(service.getRiegoTexto(calculado)).toContain('18,4 mm agua util');
    expect(service.getRiegoScore(calculado)).toBe(65);
  });

  it('separa recomendacion estimada de lectura de agua util', () => {
    const balance = {
      aguaUtilReal: null,
      estadoCalculoAguaUtil: 'no_disponible',
      estadoRecomendacionRiego: 'estimada',
      fuenteRecomendacionRiego: 'balance_climatico',
      ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 4 }],
    } as any;
    const fallida = {
      estadoCalculoAguaUtil: 'fallida',
      estadoRecomendacionRiego: 'fallida',
      ultimaPrediccionRiego: [{ fecha: '2026-07-14', cantidad: 0 }],
    } as any;

    expect(service.getRiegoTexto(balance)).toContain('4 mm estimados');
    expect(service.getRiegoScore(balance)).toBe(62);
    expect(service.getRiegoTexto(fallida)).toBe('Sin recomendacion');
    expect(service.getRiegoScore(fallida)).toBe(0);
  });

  it('no agrega un screening sanitario experimental al riesgo ejecutivo', () => {
    const prediccion = {
      fechaPrediccion: new Date().toISOString(),
      enfermedades: [
        {
          enfermedad: 'Roya Anaranjada',
          idEnfermedad: 'trigo.roya_anaranjada',
          resultado: 92,
          estado: 'calculado',
          calidadDatos: { nivel: 'media' },
          resistenciaUsada: {
            estado: 'historica',
            confianza: 'media',
            campaniaFuente: '2025/2026',
          },
          modelo: { version: 4, validacion: 'experimental' },
          variables: { resultadoCrudo: 92 },
        },
      ],
    } as any;

    expect(service.getRiesgoSanitarioScore(siembra, [prediccion])).toBe(0);
    expect(
      service.calcularCargaFitosanitaria({}, siembra, [prediccion], []),
    ).toMatchObject({ presionEnfermedades: 0, enfermedadesMonitoreadas: 0 });
    expect(service.renderTablaEnfermedades(siembra, [prediccion])).toContain(
      'Experimental',
    );
    expect(service.renderTablaEnfermedades(siembra, [prediccion])).toContain(
      '<strong>Roya Amarilla/Estriada</strong>',
    );
    expect(
      service.renderTablaEnfermedades(siembra, [prediccion]),
    ).not.toContain('<strong>Roya Anaranjada</strong>');
  });

  it('explica la ventana sanitaria sin confundirla con una lanza de humedad de suelo', () => {
    const prediccion = {
      fechaPrediccion: new Date().toISOString(),
      enfermedades: [
        {
          enfermedad: 'Mancha de la Hoja',
          idEnfermedad: 'trigo.mancha_hoja',
          resultado: 0,
          estado: 'fuera_ventana',
          modelo: { version: 5, validacion: 'operativo' },
          variables: {
            GDDBase0Siembra: 471.4,
            UmbralInicioGdd: 850,
            FormulaVersion: 5,
          },
        },
      ],
    } as any;

    const html = service.renderTablaEnfermedades(siembra, [prediccion]);

    expect(html).toContain('Fuera de ventana');
    expect(html).toContain('471,4 de 850 GDD base 0 C');
    expect(html).toContain('55% del umbral');
    expect(html).toContain(
      'La humedad de suelo no sustituye humedad foliar ni integra por si sola este riesgo.',
    );
    expect(html).not.toContain('Separacion de lecturas');
    expect(html).not.toContain('Formula Version');
    expect(service.getResumenRiesgo(siembra, [prediccion])).toMatchObject({
      titulo: 'Fuera de ventana sensible',
      detalle: '1 modelo(s) en seguimiento; no integran el riesgo actual',
    });
  });

  it('documenta Mancha en Red v4 como indice predictivo y no como severidad observada', () => {
    const siembraCebada = {
      ...siembra,
      semilla: { cultivo: 'Cebada', variedad: 'ANDREIA' },
    } as any;
    const prediccion = {
      fechaPrediccion: new Date().toISOString(),
      enfermedades: [
        {
          enfermedad: 'Mancha en Red',
          idEnfermedad: 'cebada.mancha_red',
          resultado: 86.4,
          estado: 'calculado',
          calidadDatos: { nivel: 'media' },
          resistenciaUsada: {
            estado: 'observada',
            confianza: 'alta',
          },
          modelo: { version: 4, validacion: 'operativo' },
          variables: {
            formulaVersion: 4,
            agregacionVersion: 2,
            diasFavorablesVentana: 3,
            intensidadPico: 42.7,
            diasVentana: 14,
            coberturaVentana: 0.93,
            horasMojadoContinuo: 12,
            temperaturaMojado: 18.5,
          },
        },
      ],
    } as any;

    const html = service.renderTablaEnfermedades(siembraCebada, [prediccion]);
    expect(html).toContain('86,4/100 - indice ambiental de infeccion');
    expect(html).toContain(
      '3 dia(s) favorable(s) dentro de un ciclo de 14 dias',
    );
    expect(html).toContain('intensidad maxima 42,7/100');
    expect(html).toContain('cobertura horaria 93%');
    expect(html).toContain('requiere recorrida para confirmar sintomas');
    expect(html).not.toContain('86,4% -');
  });

  it('usa solo escenas de la campana que superan el QA satelital canonico', () => {
    const puntos = service.getPuntosNdviCertificado(
      [
        ...reportes,
        {
          fechaDeLaImagen: '2026-07-13T00:00:00.000Z',
          indices: { ndvi: 0.9 },
          metadataImagen: {
            renderVersion: 'legacy-v2',
            renderQa: { ndvi: { status: 'ok', validCoveragePct: 99 } },
          },
        },
        {
          fechaDeLaImagen: '2026-07-14T00:00:00.000Z',
          indices: { ndvi: 0.8 },
          metadataImagen: {
            renderVersion: 'fixed-index-v3',
            renderQa: { ndvi: { status: 'insufficient', validCoveragePct: 2 } },
          },
        },
        {
          fechaDeLaImagen: '2026-06-20T00:00:00.000Z',
          indices: { ndvi: 0.7 },
          metadataImagen: {
            renderVersion: 'fixed-index-v3',
            renderQa: { ndvi: { status: 'ok', validCoveragePct: 90 } },
          },
        },
      ] as any,
      siembra,
    );

    expect(puntos).toHaveLength(2);
    expect(puntos.map((item: any) => item.valor)).toEqual([0.513, 0.527]);
    expect(service.getUltimoNdvi(reportes, siembra)).toMatchObject({
      valor: 0.527,
      coberturaValida: 88,
    });
  });

  it('no cruza campanas al resumir la cobertura satelital del informe', () => {
    const escenaAnterior = {
      ...reportes[0],
      fechaDeLaImagen: '2026-06-20T00:00:00.000Z',
      indices: { ndvi: 0.72 },
    } as IReporteNDVI;
    const cobertura = service.getCoberturaServicios({
      lote: {},
      siembra,
      reportesNdvi: [escenaAnterior, reportes[0]],
      predicciones: [],
      fertilizaciones: [],
      fumigaciones: [],
    } as any);
    const satelite = cobertura.find(
      (item: any) => item.nombre === 'Seguimiento satelital',
    );

    expect(satelite.lectura).toContain('1 escena(s) valida(s)');
    expect(satelite.lectura).not.toContain('tendencia');
    expect(satelite.lectura).not.toContain('0,72');
  });

  it('separa el valor NDVI del puntaje de calidad de la escena', () => {
    const html = service.renderTableroEjecutivo(
      {
        lote: {},
        siembra,
        reportesNdvi: reportes,
        predicciones: [],
        fertilizaciones: [],
        fumigaciones: [],
        cargaFitosanitaria: service.calcularCargaFitosanitaria(
          {},
          siembra,
          [],
          [],
        ),
      } as any,
      { titulo: 'Bajo', detalle: 'Sin lecturas operativas' },
    );

    expect(html).toContain('NDVI 0,527');
    expect(html).toContain('cobertura valida 88%');
    expect(html).not.toContain('--value:52,7%');
  });

  it('marca clima, satelite y riego sin datos sin inventar confianza', () => {
    const items = service.getCalidadDatosCertificado({
      lote: { establecimiento: { fuenteClimaPreferida: 'Open-Meteo' } },
      siembra: {
        ...siembra,
        estadoRecomendacionRiego: 'no_disponible',
        estadoCalculoAguaUtil: 'no_disponible',
      },
      reportesNdvi: [],
      predicciones: [],
      fertilizaciones: [],
      fumigaciones: [],
    } as any);
    const modulo = (nombre: string) =>
      items.find((item: any) => item.modulo === nombre);

    expect(modulo('Clima')).toMatchObject({
      score: 0,
      confianza: 'Sin datos',
      fuente: 'Sin fuente consolidada',
    });
    expect(modulo('Satelite')).toMatchObject({
      score: 0,
      confianza: 'Sin datos',
      fuente: 'Sin escena certificada',
    });
    expect(modulo('Riego')).toMatchObject({
      score: 0,
      confianza: 'Sin datos',
      fuente: 'Sin resultado consolidado',
    });
    expect(modulo('Riego').lectura).toContain('Sin recomendacion de riego');
  });

  it('agrega una lectura sanitaria operativa reciente y conserva su valor bajo', () => {
    const prediccion = {
      fechaPrediccion: new Date().toISOString(),
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          idEnfermedad: 'trigo.roya_hoja',
          resultado: 8,
          estado: 'calculado',
          calidadDatos: { nivel: 'media' },
          resistenciaUsada: {
            estado: 'historica',
            confianza: 'media',
            campaniaFuente: '2025/2026',
          },
          modelo: {
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            validacion: 'operativo',
          },
          variables: { resultadoCrudo: 8 },
        },
      ],
    } as any;

    expect(service.getRiesgoSanitarioScore(siembra, [prediccion])).toBe(8);
    expect(service.getResumenRiesgo(siembra, [prediccion])).toMatchObject({
      titulo: 'Bajo',
    });
  });

  it('presenta un cero sanitario operativo como riesgo bajo y no como ausencia', () => {
    const prediccion = {
      fechaPrediccion: new Date().toISOString(),
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          idEnfermedad: 'trigo.roya_hoja',
          resultado: 0,
          estado: 'calculado',
          calidadDatos: { nivel: 'media' },
          resistenciaUsada: {
            estado: 'historica',
            confianza: 'media',
            campaniaFuente: '2025/2026',
          },
          modelo: {
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            validacion: 'operativo',
          },
          variables: { resultadoCrudo: 0 },
        },
      ],
    } as any;

    const html = service.renderTablaEnfermedades(siembra, [prediccion]);
    expect(html).toContain('<td>0% - Bajo</td>');
    expect(html).not.toContain('Sin riesgo calculado');
  });

  it('no confunde estados fallidos, una camara o escenas invalidas con cobertura operativa', () => {
    const cobertura = service.getCoberturaServicios({
      lote: {
        dispositivos: [{ tipo: 'Otro', nombre: 'Camara lote' }],
      },
      siembra: {
        ...siembra,
        estadoRecomendacionRiego: 'fallida',
        ultimaPrediccionRiego: [{ cantidad: 0 }],
        ultimaPrediccionMalezas: { estado: 'sin_clima', especies: [] },
        rendimientoObtenidoKgHa: null,
        huellaHidrica: {},
      },
      reportesNdvi: [{ fechaDeLaImagen: 'invalida' }],
      predicciones: [],
      fertilizaciones: [],
      fumigaciones: [],
    } as any);
    const estado = (nombre: string) =>
      cobertura.find((item: any) => item.nombre === nombre)?.estado;

    expect(estado('Riego y balance hidrico')).toBe('sin_dato');
    expect(estado('Malezas')).toBe('sin_dato');
    expect(estado('Camaras')).toBe('con_dato');
    expect(estado('Sensores y central meteorologica')).toBe('sin_dato');
    expect(estado('Seguimiento satelital')).toBe('sin_dato');
    expect(estado('Rendimiento')).toBe('sin_dato');
    expect(estado('Huella hidrica')).toBe('sin_dato');
  });

  it('distingue una huella vacia de una metrica calculada igual a cero', () => {
    const datos = (huellaHidrica: any) =>
      ({
        lote: {},
        siembra: { ...siembra, huellaHidrica },
        reportesNdvi: [],
        predicciones: [],
        fertilizaciones: [],
        fumigaciones: [],
      }) as any;
    const huella = (entrada: any) =>
      service
        .getCoberturaServicios(entrada)
        .find((item: any) => item.nombre === 'Huella hidrica')?.estado;

    expect(huella(datos({}))).toBe('sin_dato');
    expect(huella(datos({ total: { litrosKg: 0 } }))).toBe('con_dato');
  });

  it('integra el assessment automatico de suelo aun sin campos legacy', () => {
    const datos = {
      lote: { nombre: 'Lote suelo automatico' },
      siembra,
      soilAssessment: {
        loteId: 'lote-1',
        status: 'ready',
        summary: {
          depthFromCm: 0,
          depthToCm: 30,
          canonicalTexture: 'Franco',
          effectiveDepthCm: 100,
          effectiveDepthIsFallback: true,
          profileAvailableWaterMm: 158,
        },
        source: {
          type: 'mixed',
          provider: 'INTA + ISRIC',
          confidence: 'low',
        },
        depthProfile: [
          {
            depthFromCm: 0,
            depthToCm: 5,
            chamanTexture: 'Franco',
            fieldCapacityPercentage: 28,
            wiltingPointPercentage: 12,
            availableWaterMmPerMeter: 160,
            source: 'soilgrids',
            confidence: 'low',
          },
        ],
      },
      reportesNdvi: [],
      predicciones: [],
      fertilizaciones: [],
      fumigaciones: [],
    } as any;
    const suelo = service
      .getCoberturaServicios(datos)
      .find((item: any) => item.nombre === 'Suelo y ambiente');

    expect(suelo).toMatchObject({ estado: 'con_dato' });
    expect(suelo.lectura).toContain('Franco');
    expect(
      service.renderTablaSuelo(datos.lote, datos.soilAssessment),
    ).toContain('Motor de suelo Chaman');
    expect(
      service.renderTablaSuelo(datos.lote, datos.soilAssessment),
    ).not.toContain('Completar textura');
  });

  it('incluye marca autocontenida y cobertura integral de servicios', () => {
    const html = service.renderCertificadoHtml({
      lote: {
        nombre: 'Lote prueba',
        establecimiento: { nombre: 'Establecimiento prueba' },
        ubicacion: { superficie: 12.5 },
      },
      siembra,
      reportesNdvi: [],
      predicciones: [],
      fertilizaciones: [],
      fumigaciones: [],
      cargaFitosanitaria: service.calcularCargaFitosanitaria(
        {},
        siembra,
        [],
        [],
      ),
      frio: {
        aplica: false,
        fuente: 'No aplica',
        titulo: 'No aplica',
        detalle: 'Cultivo anual',
        lectura: 'No aplica',
        objetivos: {},
      },
    } as any);

    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('Cobertura de servicios Chaman');
    expect(html).toContain('Riesgos agroclimaticos y granizo');
    expect(html).toContain('Napa y agua subterranea');
    expect(html).toContain('Estado al momento de emision');
    expect(html).toMatch(
      /\.score-card \{\s+border: 0;\s+border-right: 1px solid var\(--line\);\s+border-radius: 0;/,
    );
    expect(html).toMatch(
      /\.note \{\s+border: 0;\s+border-top: 1px solid var\(--line\);\s+background: transparent;\s+border-radius: 0;/,
    );
    expect(html).not.toContain('.warn { border-left-color:');
  });

  it('limita una fuente complementaria lenta y conserva un fallback honesto', async () => {
    jest.useFakeTimers();
    try {
      const pendiente = new Promise<string>(() => undefined);
      const resultado = service.getFuenteCertificadoConLimite(
        'clima de prueba',
        () => pendiente,
        'sin dato',
        12_000,
      );

      jest.advanceTimersByTime(12_000);

      await expect(resultado).resolves.toBe('sin dato');
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancela listados internos lentos a los cinco segundos', async () => {
    const axios = { GET: jest.fn().mockResolvedValue({ datos: [] }) };
    const servicio = new LotesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      axios as any,
      {} as any,
    ) as any;

    await servicio.getListadoInterno(
      'prediccions',
      { idSiembra: 'siembra-1' },
      {},
      5_000,
    );

    expect(axios.GET).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 5_000 }),
    );
  });

  it('no impone el timeout del informe a la carga fitosanitaria operativa', async () => {
    const axios = { GET: jest.fn().mockResolvedValue({ datos: [] }) };
    const servicio = new LotesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      axios as any,
      {} as any,
    ) as any;

    await servicio.getListadoInterno('fumigacions', {
      idSiembra: 'siembra-1',
    });

    expect(axios.GET.mock.calls[0][1]).not.toHaveProperty('timeout');
  });

  it('incorpora demanda hidrica, malezas, riesgos, sensores y bitacora sin incrustar archivos', () => {
    const ahora = new Date().toISOString();
    const html = service.renderCertificadoHtml({
      lote: {
        nombre: 'Lote integral',
        establecimiento: {
          nombre: 'Campo prueba',
          climaActual: {
            velocidadViento: { last: 8.4 },
            rafagaViento: { max: 12.1 },
          },
        },
        dispositivos: [
          {
            nombre: 'Sonda perfil',
            sensores: ['Humedad Suelo Profundidad', 'Napa', 'Batería'],
            bateria: { valor: 86, unidad: '%' },
            fechaUltimaComunicacion: ahora,
            ultimoReporte: {
              fecha: ahora,
              datos: {
                valores: {
                  Napa: [
                    {
                      unidad: 'm',
                      valores: { actual: 1.7 },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      siembra: {
        ...siembra,
        ultimaPrediccionMalezas: {
          estado: 'operativo',
          fecha: ahora,
          fuenteDatos: 'Serie canonica Chaman',
          especies: [
            {
              nombre: 'Pata de gallina',
              emergenciaActualPct: 14.2,
              emergenciaProyectada7dPct: 31.5,
              severidad: 'media',
              recomendacion: 'Recorrer el lote.',
            },
          ],
        },
      },
      demandaHidrica: {
        fechaLocal: ahora.slice(0, 10),
        timezone: 'America/Argentina/Buenos_Aires',
        fuente: 'Chamán-Meteo (ERA5-Land)',
        coberturaPct: 100,
        vpdMaxKpa: 1.7,
        horasApertura: 5,
        ventanas: [{ desde: ahora, hasta: ahora, durationHours: 5 }],
        ultima: {
          timestamp: ahora,
          localDate: ahora.slice(0, 10),
          timezone: 'America/Argentina/Buenos_Aires',
          isForecast: false,
          isDaylight: true,
          daylightSource: 'radiation',
          crop: 'Arveja',
          phase: 'vegetative',
          level: 'expected',
          stomatalState: 'open',
          vpdKpa: 1.2,
          vpdThresholdKpa: 1.8,
          source: 'chaman_meteo',
          completenessPercentage: 100,
          interpretation: 'Demanda dentro del rango esperado.',
          scope: 'Estimacion ambiental.',
          calculationVersion: 'water-demand-test',
        },
      },
      clima: {
        origen: 'canonico',
        fuente: 'Chamán-Meteo (ERA5-Land)',
        fuentes: ['Chamán-Meteo (ERA5-Land)'],
        completitudPct: 100,
        advertencias: [],
        acumulados: {},
        requerimientos: {},
        serie: [],
        lectura: 'Serie canonica.',
        riesgosAgroclimaticos: {
          fuente: 'OpenMeteo',
          lat: -33,
          lng: -64,
          generadoEn: ahora,
          granizo: {
            tipo: 'granizo',
            aplica: true,
            nivel: 'medio',
            posibilidadPct: 42,
            titulo: 'Vigilancia de granizo',
            lectura: 'Senal convectiva a vigilar.',
            recomendacion: 'Revisar el pronostico.',
            diasRiesgo: 1,
            evidencia: [],
            serie: [],
          },
        },
      },
      visitas: [
        {
          _id: 'visita-1',
          fechaVisita: ahora,
          titulo: 'Recorrida sanitaria',
          estado: 'realizada',
          observaciones: 'Sin sintomas visibles.',
        },
      ],
      evidenciasCampo: [
        {
          _id: 'foto-1',
          idVisita: 'visita-1',
          tipoMedio: 'imagen',
          url: 'https://privado/foto.jpg',
        },
        {
          _id: 'audio-1',
          idVisita: 'visita-1',
          tipoMedio: 'audio',
          url: 'https://privado/audio.ogg',
        },
      ],
      reportesNdvi: [],
      predicciones: [],
      fertilizaciones: [],
      fumigaciones: [],
      cargaFitosanitaria: service.calcularCargaFitosanitaria(
        {},
        siembra,
        [],
        [],
      ),
      frio: {
        aplica: false,
        fuente: 'No aplica',
        titulo: 'No aplica',
        detalle: 'Cultivo anual',
        lectura: 'No aplica',
        objetivos: {},
      },
    } as any);

    expect(html).toContain('Decisiones meteorologicas y respuesta del cultivo');
    expect(html).toContain('Apertura probable');
    expect(html).toContain('Pata de gallina');
    expect(html).toContain('Vigilancia de granizo');
    expect(html).toContain('Napa: 1,7 m');
    expect(html).toContain('Sin sintomas visibles.');
    expect(html).toContain('1 foto(s) · 1 audio(s)');
    expect(html).not.toContain('https://privado/');
  });

  it('resume la ultima jornada horaria y pide explicitamente la serie hourly canonica', async () => {
    const now = new Date();
    const localDate = now.toISOString().slice(0, 10);
    const hour = (offset: number, vpdKpa: number) => ({
      timestamp: new Date(
        now.getTime() - offset * 60 * 60 * 1000,
      ).toISOString(),
      localDate,
      timezone: 'UTC',
      isForecast: false,
      state: 'observed',
      weather: {
        temperatureC: 22,
        relativeHumidityPct: 60,
        vpdKpa,
        shortwaveRadiationWm2: 300,
      },
      source: 'chaman_meteo',
      sourceByVariable: {},
      qualityFlags: [],
      completenessPercentage: 100,
    });
    const repository = {
      getAgrometeorologia: jest.fn().mockResolvedValue({
        summary: {},
        dataSource: { type: 'chaman_meteo', completenessPercentage: 100 },
        series: [
          {
            date: localDate,
            isForecast: false,
            stage: 'Vegetativo',
            weather: {},
            metrics: { availableWaterPercentage: 70 },
            source: 'chaman_meteo',
            sourceByVariable: {},
            qualityFlags: [],
            warnings: [],
          },
        ],
        hourlySeries: [hour(2, 1.1), hour(1, 1.4)],
        warnings: [],
        calculationVersion: 'test',
        parametersVersion: 'test',
      }),
    };
    const instance = new LotesService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;

    const result = await instance.getDemandaHidricaCertificado({
      _id: 'siembra-1',
      semilla: { cultivo: 'Trigo' },
    });

    expect(repository.getAgrometeorologia).toHaveBeenCalledWith(
      'siembra-1',
      expect.any(String),
      expect.any(String),
      true,
    );
    expect(result).toMatchObject({
      fuente: 'Chamán-Meteo (ERA5-Land)',
      coberturaPct: 100,
      horasApertura: 2,
      vpdMaxKpa: 1.4,
    });
  });
});

describe('LotesService - clima canonico del informe agronomico', () => {
  const loteConCentro = {
    _id: 'lote-1',
    ubicacion: { centro: { lat: -39.03, lng: -67.58 } },
    establecimiento: {},
  } as any;

  const canonical = (cultivo: string, overrides: Record<string, any> = {}) => ({
    summary: {
      gddAccumulated: 428.5,
      rainAccumulatedMm: 32.4,
      thermalProcess:
        cultivo === 'Trigo' || cultivo === 'Cebada'
          ? 'vernalizacion_anual'
          : cultivo === 'Manzano'
            ? 'dormancia_perenne'
            : 'termico_fotoperiodico',
      parametersStatus: 'validado',
      parametersSource: 'Parametros varietales de prueba',
      gddBaseTemperatureC: 0,
      vernalizationAccumulated:
        cultivo === 'Trigo' || cultivo === 'Cebada' ? 18.5 : undefined,
      vernalizationRequirement:
        cultivo === 'Trigo' || cultivo === 'Cebada' ? 40 : undefined,
      ...overrides.summary,
    },
    dataSource: {
      type: 'open_meteo',
      sources: ['open_meteo'],
      completenessPercentage: 96,
      lastCalculatedAt: '2026-07-16T10:00:00.000Z',
      ...overrides.dataSource,
    },
    series: overrides.series || [],
    warnings: overrides.warnings || [],
    calculationVersion: 'agromet-test-1.0.0',
    parametersVersion: 'params-test-1.0.0',
  });

  const legacy = () =>
    ({
      fuente: 'Open-Meteo legacy',
      periodoFrio: {
        desde: '2026-05-01',
        hasta: '2026-07-16',
      },
      acumulados: {
        lluvia: 21,
        gradosDia: 310,
        horasFrio: 180,
        porcionesFrio: undefined,
      },
      requerimientos: {
        temperaturaBaseGradosDia: 0,
      },
      riesgoHelada: {
        nivel: 'bajo',
        dias: 0,
      },
      serie: [],
      calculo: {
        observaciones: [],
      },
    }) as any;

  const siembra = (cultivo: string) =>
    ({
      _id: `siembra-${cultivo.toLowerCase()}`,
      fechaSiembra: '2026-05-05T00:00:00.000Z',
      semilla: {
        cultivo,
        variedad: 'VARIEDAD PRUEBA',
        fenologiaReferencia: { temperaturaBaseC: 0 },
      },
    }) as any;

  const createService = ({
    canonicalResponse,
    legacyResponse = legacy(),
  }: {
    canonicalResponse: any;
    legacyResponse?: any;
  }) => {
    const repository = {
      getAgrometeorologia: jest.fn().mockResolvedValue(canonicalResponse),
    };
    const climaService = {
      getRiesgosAgroclimaticos: jest
        .fn()
        .mockResolvedValue({ helada: undefined }),
      getFrioTermico: jest.fn().mockResolvedValue(legacyResponse),
    };
    const instance = new LotesService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      climaService as any,
    ) as any;
    return { instance, repository, climaService };
  };

  it('prioriza la fuente canonica y no invoca el calculo legacy', async () => {
    const respuesta = canonical('Manzano');
    const { instance, repository, climaService } = createService({
      canonicalResponse: respuesta,
    });

    const clima = await instance.getClimaCertificado(
      loteConCentro,
      siembra('Manzano'),
    );

    expect(clima).toMatchObject({
      origen: 'canonico',
      versionCalculo: 'agromet-test-1.0.0',
      completitudPct: 96,
    });
    expect(repository.getAgrometeorologia).toHaveBeenCalledTimes(1);
    expect(climaService.getFrioTermico).not.toHaveBeenCalled();
  });

  it('omite clima y no invoca el endpoint legacy cuando la respuesta canonica esta vacia', async () => {
    const vacia = canonical('Manzano', {
      summary: {
        gddAccumulated: undefined,
        rainAccumulatedMm: undefined,
      },
      series: [],
    });
    delete vacia.summary.vernalizationAccumulated;
    const { instance, climaService } = createService({
      canonicalResponse: vacia,
    });

    const clima = await instance.getClimaCertificado(
      loteConCentro,
      siembra('Manzano'),
    );

    expect(clima).toBeUndefined();
    expect(climaService.getFrioTermico).not.toHaveBeenCalled();
  });

  it('no calcula progreso ni compatibilidad biologica desde el motor legacy aunque exista objetivo varietal', () => {
    const { instance } = createService({
      canonicalResponse: undefined,
    });
    const cultivoSiembra = siembra('Manzano');
    cultivoSiembra.semilla.requerimientoFrio = {
      modeloRector: 'HF',
      horasFrio: 500,
      estado: 'validado',
      fuente: 'Ensayo varietal documentado',
    };
    const clima = instance.mapLegacyClimate(
      {
        ...legacy(),
        acumulados: {
          ...legacy().acumulados,
          horasFrio: 900,
        },
      },
      undefined,
      cultivoSiembra,
    );

    expect(clima.requerimientoFrio).toMatchObject({
      model: 'HF',
      status: 'referencia',
      target: 500,
      accumulated: 900,
      coverageSufficient: false,
      continuitySufficient: false,
      interpretation: 'datos_insuficientes',
    });
    expect(clima.requerimientoFrio.progressPercentage).toBeUndefined();
    expect(clima.requerimientoFrio.compatible).toBeUndefined();
  });

  it.each(['Trigo', 'Cebada'])(
    '%s muestra vernalizacion y no presenta HF ni CP como dormancia',
    (cultivo) => {
      const { instance } = createService({
        canonicalResponse: canonical(cultivo),
      });
      const cultivoSiembra = siembra(cultivo);
      const clima = instance.mapCanonicalClimate(
        canonical(cultivo, {
          summary: {
            chillingHoursAccumulated: 240,
            chillPortionsAccumulated: 16,
          },
        }),
        undefined,
        cultivoSiembra,
      );
      const frio = instance.getFrioCertificado(
        loteConCentro,
        cultivoSiembra,
        clima,
      );
      const html = instance.renderTablaClimaAgronomica(clima, frio, false);

      expect(frio).toMatchObject({ aplica: false });
      expect(html).toContain('Vernalizacion varietal');
      expect(html).toContain('18,5 UV');
      expect(html).not.toContain('Horas frio (HF)');
      expect(html).not.toContain('Chill portions (CP)');
    },
  );

  it('Arveja no recibe un modulo de frio de dormancia', () => {
    const { instance } = createService({
      canonicalResponse: canonical('Arveja'),
    });
    const cultivoSiembra = siembra('Arveja');
    const clima = instance.mapCanonicalClimate(
      canonical('Arveja'),
      undefined,
      cultivoSiembra,
    );
    const frio = instance.getFrioCertificado(
      loteConCentro,
      cultivoSiembra,
      clima,
    );
    const html = instance.renderTablaClimaAgronomica(clima, frio, false);

    expect(frio).toMatchObject({
      aplica: false,
      titulo: 'No aplica',
      detalle: 'Cultivo sin dormancia perenne',
    });
    expect(html).not.toContain('Horas frio (HF)');
    expect(html).not.toContain('Chill portions (CP)');
    expect(html).not.toContain('Vernalizacion varietal');
  });

  it('presenta CP como Sin dato cuando el motor canonico no lo informa', () => {
    const { instance } = createService({
      canonicalResponse: canonical('Manzano'),
    });
    const cultivoSiembra = siembra('Manzano');
    const clima = instance.mapCanonicalClimate(
      canonical('Manzano', {
        summary: {
          chillingHoursAccumulated: 390,
          utahChillUnitsAccumulated: 82,
          chillPortionsAccumulated: undefined,
        },
      }),
      undefined,
      cultivoSiembra,
    );
    const frio = instance.getFrioCertificado(
      loteConCentro,
      cultivoSiembra,
      clima,
    );
    const html = instance.renderTablaClimaAgronomica(clima, frio, true);

    expect(html).toMatch(/Chill portions \(CP\)<\/td>\s*<td>Sin dato<\/td>/);
    expect(html).not.toContain('0 CP');
  });

  it('incluye en el informe la evolucion acumulada y el aporte diario con descuentos Utah', () => {
    const serie = [
      {
        date: '2026-05-01',
        isForecast: false,
        weather: {},
        metrics: {
          temperatureMinC: 3,
          temperatureMaxC: 14,
          chillingHours: 6,
          chillingHoursAccumulated: 6,
          utahChillUnits: 5,
          utahChillUnitsAccumulated: 5,
          chillPortions: 0.3,
          chillPortionsAccumulated: 0.3,
        },
        source: 'open_meteo',
        sourceByVariable: {},
        qualityFlags: [],
        warnings: [],
      },
      {
        date: '2026-05-02',
        isForecast: false,
        weather: {},
        metrics: {
          temperatureMinC: 5,
          temperatureMaxC: 21,
          chillingHours: 2,
          chillingHoursAccumulated: 8,
          utahChillUnits: -2,
          utahChillUnitsAccumulated: 3,
          chillPortions: 0.15,
          chillPortionsAccumulated: 0.45,
        },
        source: 'open_meteo',
        sourceByVariable: {},
        qualityFlags: [],
        warnings: [],
      },
    ];
    const { instance } = createService({
      canonicalResponse: canonical('Manzano', { series: serie }),
    });
    const clima = instance.mapCanonicalClimate(
      canonical('Manzano', {
        summary: {
          chillingHoursAccumulated: 8,
          utahChillUnitsAccumulated: 3,
          chillPortionsAccumulated: 0.45,
        },
        series: serie,
      }),
      undefined,
      siembra('Manzano'),
    );

    const html = instance.renderGraficosFrio(clima);

    expect(html).toContain('Evolucion acumulada');
    expect(html).toContain('Aporte diario');
    expect(html).toContain('data-panel="temperature-min"');
    expect(html).toContain('data-panel="temperature-max"');
    expect(html).toContain('data-panel="utah"');
    expect(html).toContain('data-panel="cp-daily"');
    expect(html).toContain('15,9 C');
    expect(html).toContain('#d7833d');
    expect(html).not.toContain('<polyline fill="none" stroke="#8d65b8"');
    expect(html).not.toContain('HFE');
  });

  it('informa Datos insuficientes y descarta compatibilidad heredada en el informe del lote', () => {
    const respuesta = canonical('Manzano', {
      summary: {
        coldRequirement: {
          model: 'HF',
          status: 'validado',
          source: 'Ficha varietal validada',
          target: 900,
          accumulated: 940,
          progressPercentage: 104.4,
          compatible: true,
          interpretation: 'datos_insuficientes',
        },
      },
    });
    const { instance } = createService({
      canonicalResponse: respuesta,
    });
    const cultivoSiembra = siembra('Manzano');
    const clima = instance.mapCanonicalClimate(
      respuesta,
      undefined,
      cultivoSiembra,
    );
    const frio = instance.getFrioCertificado(
      loteConCentro,
      cultivoSiembra,
      clima,
    );
    const tablaClima = instance.renderTablaClimaAgronomica(clima, frio, true);
    const informe = instance.renderCertificadoHtml({
      lote: {
        ...loteConCentro,
        nombre: 'Lote prueba frio',
        establecimiento: { nombre: 'Establecimiento prueba' },
      },
      siembra: cultivoSiembra,
      clima,
      frio,
      reportesNdvi: [],
      predicciones: [],
      fertilizaciones: [],
      fumigaciones: [],
      cargaFitosanitaria: instance.calcularCargaFitosanitaria(
        loteConCentro,
        cultivoSiembra,
        [],
        [],
      ),
    });
    const lectura = `${tablaClima} ${informe}`.toLowerCase();

    expect(tablaClima).toContain('Datos insuficientes');
    expect(informe).toContain('Datos insuficientes');
    expect(lectura).not.toContain('clima compatible');
    expect(lectura).not.toMatch(/\bcumplid[oa]s?\b/);
  });

  it('calcula la calidad climatica con completitud y cobertura de campo reales', () => {
    const { instance } = createService({
      canonicalResponse: canonical('Manzano'),
    });
    const clima = instance.mapCanonicalClimate(
      canonical('Manzano', {
        dataSource: {
          type: 'mixed',
          sources: ['sensor', 'open_meteo'],
          sensorNames: ['Sonda Norte'],
          completenessPercentage: 64,
          fieldCoveragePercentage: 25,
        },
      }),
      undefined,
      siembra('Manzano'),
    );
    const calidad = instance
      .getCalidadDatosCertificado({
        lote: {},
        siembra: siembra('Manzano'),
        clima,
        reportesNdvi: [],
        predicciones: [],
        fertilizaciones: [],
        fumigaciones: [],
      })
      .find((item: any) => item.modulo === 'Clima');

    // 64% completitud * 0,5 + fuente sensor 90 * 0,3
    // + 25% cobertura de campo * 0,2 = 64/100.
    expect(calidad).toMatchObject({
      score: 64,
      confianza: 'Media',
      fuente: 'Sensor Sonda Norte + Open-Meteo',
    });
    expect(calidad.lectura).toContain('64% completitud');
    expect(calidad.lectura).toContain('25% cobertura de temperatura de campo');
  });

  it('expone Chaman-Meteo como procedencia en informes puros y mixtos', () => {
    const { instance } = createService({
      canonicalResponse: canonical('Trigo'),
    });
    const pure = instance.mapCanonicalClimate(
      canonical('Trigo', {
        dataSource: {
          type: 'chaman_meteo',
          sources: ['chaman_meteo'],
        },
      }),
      undefined,
      siembra('Trigo'),
    );

    expect(pure.fuente).toBe('Chamán-Meteo (ERA5-Land)');
    expect(pure.fuentes).toEqual(['Chamán-Meteo (ERA5-Land)']);
    expect(pure.fuente).not.toContain('Open-Meteo');

    const mixed = instance.mapCanonicalClimate(
      canonical('Trigo', {
        dataSource: {
          type: 'mixed',
          sources: ['sensor'],
          sensorNames: ['K-01'],
        },
        series: [
          {
            date: '2026-05-01',
            weather: {},
            metrics: {},
            source: 'mixed',
            sourceByVariable: {
              temperatureMeanC: 'derived_chaman_meteo',
            },
            qualityFlags: [],
            warnings: [],
          },
        ],
      }),
      undefined,
      siembra('Trigo'),
    );

    expect(mixed.fuente).toContain('Sensor K-01');
    expect(mixed.fuente).toContain('Chamán-Meteo (ERA5-Land)');
    expect(mixed.fuente).not.toContain('Open-Meteo');
  });
});
