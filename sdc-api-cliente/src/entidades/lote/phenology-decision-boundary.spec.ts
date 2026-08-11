import {
  ISiembra,
  campaniaFenologicaParaFecha,
  obtenerInicioTemporadaFrioObservado,
  obtenerRegistroFenologicoDecisorioEnFecha,
} from 'modelos/src';

describe('limite fenologico compartido para informes y satelite', () => {
  function siembra(registros: ISiembra['registrosFenologicos']): ISiembra {
    return {
      _id: 'siembra-1',
      idLote: 'lote-1',
      fechaSiembra: '2026-05-01T00:00:00.000Z',
      semilla: { cultivo: 'Trigo' },
      registrosFenologicos: registros,
    } as ISiembra;
  }

  it.each([
    { confianza: 'baja' as const, coberturaObservadaPct: 80 },
    { confianza: 'alta' as const, coberturaObservadaPct: 0 },
  ])('no certifica un registro no decisorio: %p', (metadata) => {
    const result = obtenerRegistroFenologicoDecisorioEnFecha(
      siembra([
        {
          id: 'registro-1',
          etapa: 'Hoja Bandera',
          fechaInicioEtapa: '2026-07-01T00:00:00.000Z',
          campania: '2026/2027',
          ...metadata,
        },
      ]),
      new Date('2026-07-02T00:00:00.000Z'),
    );

    expect(result).toBeUndefined();
  });

  it('excluye el registro reemplazado y una campaña incompatible', () => {
    const result = obtenerRegistroFenologicoDecisorioEnFecha(
      siembra([
        {
          id: 'original',
          etapa: 'Hoja Bandera',
          fechaInicioEtapa: '2026-06-01T00:00:00.000Z',
          campania: '2026/2027',
          confianza: 'alta',
        },
        {
          id: 'correccion',
          reemplazaRegistroId: 'original',
          etapa: 'Emergencia',
          fechaInicioEtapa: '2026-06-02T00:00:00.000Z',
          campania: '2024/2025',
          confianza: 'alta',
        },
      ]),
      new Date('2026-07-02T00:00:00.000Z'),
    );

    expect(result).toBeUndefined();
  });

  it('aplica una observacion puntual solo en su fecha civil', () => {
    const data = siembra([
      {
        id: 'observacion-1',
        etapa: 'Hoja Bandera',
        tipoEvento: 'observacion',
        fecha: '2026-07-01T15:00:00.000Z',
        campania: '2026/2027',
        confianza: 'alta',
        coberturaObservadaPct: 70,
      },
    ]);

    expect(
      obtenerRegistroFenologicoDecisorioEnFecha(
        data,
        new Date('2026-07-01T20:00:00.000Z'),
      )?.id,
    ).toBe('observacion-1');
    expect(
      obtenerRegistroFenologicoDecisorioEnFecha(
        data,
        new Date('2026-07-02T20:00:00.000Z'),
      ),
    ).toBeUndefined();
  });

  it('mantiene vigente un inicio de etapa de confianza suficiente', () => {
    const result = obtenerRegistroFenologicoDecisorioEnFecha(
      siembra([
        {
          id: 'inicio-1',
          etapa: 'Hoja Bandera',
          tipoEvento: 'inicio_etapa',
          fechaInicioEtapa: '2026-07-01T00:00:00.000Z',
          campania: '2026-2027',
          confianza: 'media',
          coberturaObservadaPct: 55,
        },
      ]),
      new Date('2026-07-05T00:00:00.000Z'),
    );

    expect(result?.id).toBe('inicio-1');
  });

  it('no certifica una etapa de la campania despues de la cosecha', () => {
    const data = {
      ...siembra([
        {
          id: 'madurez-1',
          etapa: 'Madurez',
          tipoEvento: 'inicio_etapa',
          fechaInicioEtapa: '2026-07-05T00:00:00.000Z',
          campania: '2026/2027',
          confianza: 'alta',
          coberturaObservadaPct: 80,
        },
      ]),
      fechaCosecha: '2026-07-10T00:00:00.000Z',
    } as ISiembra;

    expect(
      obtenerRegistroFenologicoDecisorioEnFecha(
        data,
        new Date('2026-07-20T00:00:00.000Z'),
      ),
    ).toBeUndefined();
  });

  it('mantiene Dormancia del 1-may como inicio vigente al cruzar el 1-jul en Pecan Kiowa', () => {
    const data = {
      _id: 'pecan-kiowa-2020',
      idLote: 'lote-kiowa',
      fechaSiembra: '2020-08-15T00:00:00.000Z',
      semilla: { cultivo: 'Pecan', variedad: 'Kiowa' },
      registrosFenologicos: [
        {
          id: 'dormancia-1-may',
          tipoEvento: 'inicio_etapa',
          accion: 'inicio',
          etapa: 'Dormancia',
          fecha: '2026-05-01T12:00:00.000Z',
          fechaInicioEtapa: '2026-05-01T12:00:00.000Z',
          // Compatibilidad con el valor ya persistido por la frontera antigua
          // del 1-jul; no se requiere reescribir la base productiva.
          campania: '2025/2026',
          confianza: 'alta',
          frioAcumulado: {
            horasFrio: 0,
            unidadesFrioUtah: 0,
            porcionesFrio: 0,
            gradosDia: 0,
          },
        },
      ],
    } as ISiembra;
    const agosto = new Date('2026-08-10T12:00:00.000Z');

    expect(campaniaFenologicaParaFecha(data, new Date('2026-05-01T12:00:00.000Z'))).toBe(
      '2026/2027',
    );
    expect(campaniaFenologicaParaFecha(data, agosto)).toBe('2026/2027');
    expect(obtenerRegistroFenologicoDecisorioEnFecha(data, agosto)?.id).toBe(
      'dormancia-1-may',
    );
    expect(obtenerInicioTemporadaFrioObservado(data, agosto)?.id).toBe(
      'dormancia-1-may',
    );
    expect(
      obtenerRegistroFenologicoDecisorioEnFecha(
        data,
        new Date('2027-08-10T12:00:00.000Z'),
      ),
    ).toBeUndefined();
  });

  it('no convierte una observacion puntual de Dormancia en inicio persistente', () => {
    const data = {
      _id: 'pecan-observacion',
      idLote: 'lote-kiowa',
      fechaSiembra: '2020-08-15T00:00:00.000Z',
      semilla: { cultivo: 'Pecan', variedad: 'Kiowa' },
      registrosFenologicos: [
        {
          id: 'observacion-dormancia',
          tipoEvento: 'observacion',
          accion: 'observacion',
          etapa: 'Dormancia',
          fecha: '2026-05-01T12:00:00.000Z',
          campania: '2025/2026',
          confianza: 'alta',
        },
      ],
    } as ISiembra;
    const agosto = new Date('2026-08-10T12:00:00.000Z');

    expect(obtenerRegistroFenologicoDecisorioEnFecha(data, agosto)).toBeUndefined();
    expect(obtenerInicioTemporadaFrioObservado(data, agosto)).toBeUndefined();
  });

  it('no deja que una Dormancia perenne antigua sin campania gobierne otro ciclo', () => {
    const data = {
      _id: 'pecan-kiowa-sin-campania',
      idLote: 'lote-kiowa',
      fechaSiembra: '2020-08-15T00:00:00.000Z',
      semilla: { cultivo: 'Pecan', variedad: 'Kiowa' },
      registrosFenologicos: [
        {
          id: 'dormancia-2024-sin-campania',
          tipoEvento: 'inicio_etapa',
          accion: 'inicio',
          etapa: 'Dormancia',
          fechaInicioEtapa: '2024-05-01T12:00:00.000Z',
          confianza: 'alta',
        },
      ],
    } as ISiembra;
    const agosto2026 = new Date('2026-08-10T12:00:00.000Z');

    expect(
      obtenerRegistroFenologicoDecisorioEnFecha(data, agosto2026),
    ).toBeUndefined();
    expect(
      obtenerInicioTemporadaFrioObservado(data, agosto2026),
    ).toBeUndefined();
  });
});
