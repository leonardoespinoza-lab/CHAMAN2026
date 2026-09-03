import { PrediccionFrutalesService } from './frutales';

describe('screening sanitario experimental de frutales', () => {
  const fechaHoy = new Date().toISOString().slice(0, 10);

  const respuesta = (etapa: string) => ({
    dataSource: {
      type: 'chaman_meteo',
      stationName: 'ERA5-Land',
      completenessPercentage: 100,
    },
    series: [
      {
        date: fechaHoy,
        isForecast: false,
        stage: etapa,
        stageSource: 'rango_termico_referencia',
        stageConfidence: 'referencia',
        source: 'chaman_meteo',
        sourceByVariable: {},
        qualityFlags: [],
        warnings: [],
        weather: {
          temperatureMeanC: 20,
          temperatureMinC: 12,
          temperatureMaxC: 25,
          relativeHumidityMeanPct: 90,
          precipitationMm: 3,
        },
        metrics: { leafWetnessHours: 8 },
      },
    ],
  });

  it('calcula solamente enfermedades de Manzano y aplica el perfil varietal', async () => {
    const creadas: any[] = [];
    const update = jest.fn();
    const service = new PrediccionFrutalesService(
      {
        get: jest.fn().mockResolvedValue({ datos: [] }),
        create: jest.fn(async (value) => (creadas.push(value), value)),
      } as any,
      { update } as any,
      {
        getAgrometeorologiaSiembra: jest
          .fn()
          .mockResolvedValue(respuesta('Floracion')),
      } as any,
    );

    await service.hacerPredicciones({
      _id: 'siembra-manzano',
      idEstablecimiento: 'establecimiento-1',
      fechaSiembra: '2020-01-01T03:00:00.000Z',
      coordenadas: { lat: -38.8, lng: -68.1 },
      semilla: {
        cultivo: 'Manzano',
        variedad: 'Rosy Glow',
        resistencia: [
          {
            enfermedad: 'Sarna del Manzano',
            idEnfermedad: 'manzano.sarna',
            perfil: 'MR',
            multiplicador: 0.5,
            indiceResistencia: 2 / 3,
            estado: 'observada',
            confianza: 'alta',
            fuente: 'Ensayo varietal',
            campaniaFuente: '2025-2026',
          },
          {
            enfermedad: 'Oidio del Manzano',
            idEnfermedad: 'manzano.oidio',
            perfil: 'S',
            multiplicador: 1,
            indiceResistencia: 0,
            estado: 'inferida',
            confianza: 'baja',
            fuente: 'Escenario conservador Chaman',
            campaniaFuente: '2026-2027',
          },
          {
            enfermedad: 'Fuego Bacteriano',
            idEnfermedad: 'frutales.fuego_bacteriano',
            perfil: 'S',
            multiplicador: 1,
            indiceResistencia: 0,
            estado: 'inferida',
            confianza: 'baja',
            fuente: 'Escenario conservador Chaman',
            campaniaFuente: '2026-2027',
          },
        ],
      },
    } as any);

    expect(creadas).toHaveLength(1);
    const enfermedades = creadas[0].enfermedades;
    expect(enfermedades.map((item: any) => item.idEnfermedad)).toEqual([
      'manzano.sarna',
      'manzano.oidio',
      'frutales.fuego_bacteriano',
    ]);
    expect(
      enfermedades.some(
        (item: any) => item.idEnfermedad === 'manzano.carpocapsa',
      ),
    ).toBe(false);
    const sarna = enfermedades[0];
    expect(sarna.estado).toBe('calculado');
    expect(sarna.modelo.validacion).toBe('experimental');
    expect(sarna.resistenciaUsada).toMatchObject({
      perfil: 'MR',
      multiplicador: 0.5,
      estado: 'observada',
    });
    expect(sarna.variables.kVar).toBe(0.5);
    expect(sarna.calidadDatos.limitaciones).toContain(
      'No genera alertas ni prescripciones automaticas.',
    );
    expect(update).toHaveBeenCalledWith(
      'siembra-manzano',
      expect.objectContaining({ ultimaPrediccion: creadas[0] }),
    );
  });

  it('mantiene las enfermedades fuera de ventana durante reposo', async () => {
    const creadas: any[] = [];
    const service = new PrediccionFrutalesService(
      {
        get: jest.fn().mockResolvedValue({ datos: [] }),
        create: jest.fn(async (value) => (creadas.push(value), value)),
      } as any,
      { update: jest.fn() } as any,
      {
        getAgrometeorologiaSiembra: jest
          .fn()
          .mockResolvedValue(respuesta('Reposo invernal')),
      } as any,
    );

    await service.hacerPredicciones({
      _id: 'siembra-peral',
      fechaSiembra: '2020-01-01T03:00:00.000Z',
      coordenadas: { lat: -38.8, lng: -68.1 },
      semilla: { cultivo: 'Peral', variedad: 'Williams' },
    } as any);

    expect(creadas[0].enfermedades).toHaveLength(2);
    expect(
      creadas[0].enfermedades.every(
        (item: any) => item.estado === 'fuera_ventana',
      ),
    ).toBe(true);
  });
});
