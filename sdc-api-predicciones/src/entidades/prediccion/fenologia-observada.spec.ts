import { resolverFenologiaTermicaArveja } from 'modelos/src';
import {
  aplicarEtapaFenologicaObservada,
  calidadFenologiaManual,
  getContextoFenologicoManual,
  getUmbralGddEtapaArveja,
  reanclarGddFenologico,
  resolverEtapaFenologicaObservada,
} from './fenologia-observada';

const cronologiaTrigo = [
  { etapa: 0, duracionDias: 7 },
  { etapa: 1, duracionDias: 10 },
  { etapa: 2, duracionDias: 12 },
  { etapa: 3, duracionDias: 5 },
  { etapa: 4, duracionDias: 5 },
  { etapa: 5, duracionDias: 8 },
  { etapa: 6, duracionDias: 15 },
  { etapa: 7 },
];

const referenciaArveja = {
  unidadEtapas: 'grados_dia' as const,
  temperaturaBaseC: 3,
  rangosTermicos: {
    'S-E': { min: 125, max: 140 },
    'E-R1': { min: 685, max: 760 },
    'R1-MF': { min: 585, max: 660 },
    'S-MF': { min: 1395, max: 1560 },
  },
};

describe('fenologia manual vigente', () => {
  it('no mezcla campanias aunque el registro incompatible sea mas reciente', () => {
    const siembra = {
      _id: 'siembra-2026',
      fechaSiembra: '2026-05-01T03:00:00.000Z',
      semilla: { cultivo: 'Trigo' as const },
      registrosFenologicos: [
        {
          id: 'vigente',
          fecha: '2026-06-01T12:00:00.000Z',
          tipoEvento: 'observacion' as const,
          etapa: 'Emergencia',
          cultivo: 'Trigo',
          campania: '2026/2027',
        },
        {
          id: 'otra-campania',
          fecha: '2026-06-15T12:00:00.000Z',
          tipoEvento: 'inicio_etapa' as const,
          etapa: 'Hoja Bandera',
          cultivo: 'Trigo',
          campania: '2025/2026',
        },
      ],
    };

    const contexto = getContextoFenologicoManual(
      siembra,
      new Date('2026-06-15T18:00:00.000Z'),
      'Trigo',
    );
    const contextoFechaVigente = getContextoFenologicoManual(
      siembra,
      new Date('2026-06-01T18:00:00.000Z'),
      'Trigo',
    );

    expect(contexto.anclaje).toBeUndefined();
    expect(contexto.observacion).toBeUndefined();
    expect(contextoFechaVigente.observacion?.registro.id).toBe('vigente');
  });

  it('ignora registros de otro cultivo o de otra siembra', () => {
    const siembra = {
      _id: 'siembra-trigo',
      fechaSiembra: '2026-05-01T03:00:00.000Z',
      semilla: { cultivo: 'Trigo' as const },
      registrosFenologicos: [
        {
          id: 'anclaje-compatible',
          fechaInicioEtapa: '2026-06-01T00:00:00.000Z',
          tipoEvento: 'inicio_etapa' as const,
          etapa: 'Emergencia',
          cultivo: 'Trigo',
          idSiembra: 'siembra-trigo',
          campania: '2026/2027',
        },
        {
          id: 'otro-cultivo',
          fechaInicioEtapa: '2026-06-10T00:00:00.000Z',
          tipoEvento: 'inicio_etapa' as const,
          etapa: 'R5',
          cultivo: 'Soja',
          idSiembra: 'siembra-trigo',
          campania: '2026/2027',
        },
        {
          id: 'otra-siembra',
          fechaInicioEtapa: '2026-06-12T00:00:00.000Z',
          tipoEvento: 'inicio_etapa' as const,
          etapa: 'Hoja Bandera',
          cultivo: 'Trigo',
          idSiembra: 'siembra-ajena',
          campania: '2026/2027',
        },
      ],
    };

    const contexto = getContextoFenologicoManual(
      siembra,
      new Date('2026-06-15T18:00:00.000Z'),
      'Trigo',
    );

    expect(contexto.anclaje?.registro.id).toBe('anclaje-compatible');
  });

  it.each([
    {
      id: 'confianza-baja',
      confianza: 'baja' as const,
      coberturaObservadaPct: 80,
    },
    {
      id: 'cobertura-cero',
      confianza: 'alta' as const,
      coberturaObservadaPct: 0,
    },
  ])(
    'mantiene $id auditable pero no permite que gobierne una decision sanitaria',
    (metadata) => {
      const siembra = {
        _id: 'siembra-trigo',
        fechaSiembra: '2026-05-01T03:00:00.000Z',
        semilla: { cultivo: 'Trigo' as const },
        registrosFenologicos: [
          {
            ...metadata,
            fechaInicioEtapa: '2026-06-01T00:00:00.000Z',
            tipoEvento: 'inicio_etapa' as const,
            etapa: 'Hoja Bandera',
            cultivo: 'Trigo',
            idSiembra: 'siembra-trigo',
            campania: '2026/2027',
          },
        ],
      };

      expect(
        getContextoFenologicoManual(
          siembra,
          new Date('2026-06-15T18:00:00.000Z'),
          'Trigo',
        ),
      ).toEqual({});
      expect(
        resolverEtapaFenologicaObservada(
          siembra,
          new Date('2026-06-15T18:00:00.000Z'),
          'Trigo',
          cronologiaTrigo,
        ),
      ).toBeUndefined();
    },
  );

  it('preserva confianza y cobertura reales en la calidad fenologica manual', () => {
    const calidad = calidadFenologiaManual({
      registro: {
        id: 'registro-medio',
        etapa: 'Hoja Bandera',
        confianza: 'media',
        coberturaObservadaPct: 45,
        creadoEn: '2026-06-01T12:00:00.000Z',
      },
      tipoAplicacion: 'reanclaje',
      fechaRegistro: '2026-06-01T00:00:00.000Z',
      diasDesdeRegistro: 4,
    });

    expect(calidad).toMatchObject({
      nivel: 'media',
      fuente: 'manual',
      cobertura: 0.45,
      fallback: false,
      fechaActualizacion: '2026-06-01T12:00:00.000Z',
    });
  });

  it('excluye el registro reemplazado y usa solamente la correccion vigente', () => {
    const siembra = {
      _id: 'siembra-2026',
      fechaSiembra: '2026-05-01T03:00:00.000Z',
      semilla: { cultivo: 'Trigo' as const },
      registrosFenologicos: [
        {
          id: 'original',
          fechaInicioEtapa: '2026-06-01T00:00:00.000Z',
          tipoEvento: 'inicio_etapa' as const,
          etapa: 'Hoja Bandera',
          cultivo: 'Trigo',
          campania: '2026/2027',
        },
        {
          id: 'corregido',
          reemplazaRegistroId: 'original',
          fechaInicioEtapa: '2026-06-01T00:00:00.000Z',
          tipoEvento: 'correccion' as const,
          etapa: 'Emergencia',
          cultivo: 'Trigo',
          campania: '2026/2027',
          actualizadoEn: '2026-06-03T12:00:00.000Z',
        },
      ],
    };

    const resuelta = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-06-04T12:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );

    expect(resuelta?.registro.id).toBe('corregido');
    expect(resuelta?.etapaRegistrada).toBe(1);
    expect(resuelta?.etapa).toBe(1);
  });

  it('aplica una observacion solo durante su fecha civil', () => {
    const siembra = {
      fechaSiembra: '2026-05-01T03:00:00.000Z',
      semilla: { cultivo: 'Trigo' as const },
      registrosFenologicos: [
        {
          id: 'observacion-dia',
          fechaObservacion: '2026-07-01T18:00:00.000Z',
          tipoEvento: 'observacion' as const,
          accion: 'observacion' as const,
          etapa: 'Hoja Bandera',
          cultivo: 'Trigo',
          campania: '2026/2027',
        },
      ],
    };

    const durante = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-07-01T00:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );
    const despues = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-07-02T12:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );

    expect(durante?.etapa).toBe(3);
    expect(durante?.tipoAplicacion).toBe('observacion_puntual');
    expect(despues).toBeUndefined();
    expect(aplicarEtapaFenologicaObservada(4, despues)).toBe(4);
  });

  it('usa la fecha agronomica y no el momento posterior de carga', () => {
    const siembra = {
      fechaSiembra: '2026-05-01T03:00:00.000Z',
      semilla: { cultivo: 'Trigo' as const },
      registrosFenologicos: [
        {
          id: 'observacion-historica',
          fecha: '2026-06-20T15:00:00.000Z',
          fechaObservacion: '2026-07-05T15:00:00.000Z',
          tipoEvento: 'observacion' as const,
          accion: 'observacion' as const,
          etapa: 'Hoja Bandera',
          cultivo: 'Trigo',
          campania: '2026/2027',
        },
      ],
    };

    const fechaAgronomica = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-06-20T18:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );
    const fechaCarga = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-07-05T18:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );

    expect(fechaAgronomica?.registro.id).toBe('observacion-historica');
    expect(fechaAgronomica?.etapa).toBe(3);
    expect(fechaCarga).toBeUndefined();
  });

  it('reancla un inicio de etapa y avanza despues con las duraciones del crono', () => {
    const siembra = {
      fechaSiembra: '2026-05-01T03:00:00.000Z',
      semilla: { cultivo: 'Trigo' as const },
      registrosFenologicos: [
        {
          id: 'inicio-hoja-bandera',
          fechaInicioEtapa: '2026-07-01T12:00:00.000Z',
          tipoEvento: 'inicio_etapa' as const,
          etapa: 'Hoja Bandera',
          cultivo: 'Trigo',
          campania: '2026/2027',
        },
      ],
    };

    const alInicio = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-07-01T00:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );
    const cincoDiasDespues = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-07-06T00:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );
    const diezDiasDespues = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-07-11T00:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );

    expect(alInicio?.etapa).toBe(3);
    expect(cincoDiasDespues?.etapa).toBe(4);
    expect(diezDiasDespues?.etapa).toBe(5);
  });

  it('trata un biofix como reanclaje persistente y no como observacion', () => {
    const siembra = {
      fechaSiembra: '2026-05-01T03:00:00.000Z',
      semilla: { cultivo: 'Trigo' as const },
      registrosFenologicos: [
        {
          id: 'biofix-antesis',
          fechaInicioEtapa: '2026-07-01T12:00:00.000Z',
          tipoEvento: 'biofix' as const,
          etapa: 'Antesis',
          cultivo: 'Trigo',
          campania: '2026/2027',
        },
      ],
    };

    const despues = resolverEtapaFenologicaObservada(
      siembra,
      new Date('2026-07-10T12:00:00.000Z'),
      'Trigo',
      cronologiaTrigo,
    );

    expect(despues?.tipoAplicacion).toBe('reanclaje');
    expect(despues?.etapaRegistrada).toBe(5);
    expect(despues?.etapa).toBe(6);
  });

  it('reancla Arveja al umbral observado y conserva el calor posterior', () => {
    const umbralR1 = getUmbralGddEtapaArveja(referenciaArveja, 'R1');
    expect(umbralR1).toBe(855);

    const gddEnRegistro = 430;
    const gddAlRegistrar = reanclarGddFenologico(
      gddEnRegistro,
      gddEnRegistro,
      umbralR1,
    );
    const gddLuego = reanclarGddFenologico(1100, gddEnRegistro, umbralR1);

    expect(gddAlRegistrar).toBe(855);
    expect(gddLuego).toBe(1525);
    expect(
      resolverFenologiaTermicaArveja({
        referencia: referenciaArveja,
        gradosDiaAcumulados: gddAlRegistrar,
      }).codigo,
    ).toBe('R1');
    expect(
      resolverFenologiaTermicaArveja({
        referencia: referenciaArveja,
        gradosDiaAcumulados: gddLuego,
      }).codigo,
    ).toBe('MF');
  });
});
