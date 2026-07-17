import {
  IContextoVentanaSanitariaTrigo,
  IPrediccion,
  ISemilla,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';
import { FusariumDeLaEspigaService } from './fusarium_de_la_espiga';
import { ManchaAmarillaService } from './mancha_amarilla';
import { ManchaDeLaHojaService } from './mancha_de_la_hoja';
import { RoyaAnaranjadaService } from './roya_anaranjada';
import { RoyaDeLaHojaService } from './roya_de_la_hoja';
import {
  camposClimaticosFaltantes,
  crearPrediccionFueraVentana,
} from './calidad';

describe('servicios sanitarios de trigo v4', () => {
  const horasRoya = Array.from({ length: 240 }, (_, indice) => ({
    fecha: new Date(
      new Date('2026-07-01T00:00:00Z').getTime() + indice * 60 * 60 * 1000,
    ).toISOString(),
    temperatura: 20,
    humedadRelativa: 70,
    lluviaMm: 0,
  }));
  const contexto: IContextoVentanaSanitariaTrigo = {
    gddBase0DesdeSiembra: 850,
    coberturaGdd: 1,
    etapa: 2,
    fenologiaObservada: false,
  };

  const semilla = {
    cultivo: 'Trigo',
    resistencia: [
      {
        idEnfermedad: 'trigo.roya_hoja',
        enfermedad: 'Roya de la Hoja',
        perfil: 'MR',
        multiplicador: 0.5,
        indiceResistencia: 2 / 3,
        estado: 'observada',
        confianza: 'alta',
        campaniaFuente: '2025-2026',
      },
      {
        idEnfermedad: 'trigo.roya_anaranjada',
        enfermedad: 'Roya Anaranjada',
        perfil: 'S',
        multiplicador: 1,
        indiceResistencia: 0,
        estado: 'observada',
        confianza: 'alta',
        campaniaFuente: '2025-2026',
      },
      {
        idEnfermedad: 'trigo.mancha_amarilla',
        enfermedad: 'Mancha Amarilla',
        perfil: 'MS',
        multiplicador: 0.75,
        estado: 'observada',
        confianza: 'alta',
        campaniaFuente: '2025-2026',
      },
      {
        idEnfermedad: 'trigo.mancha_hoja',
        enfermedad: 'Mancha de la Hoja',
        perfil: 'MS',
        multiplicador: 0.75,
        estado: 'historica',
        confianza: 'media',
        // También debe reconocer el formato corto habitual de los Excel.
        campaniaFuente: '20/21',
      },
      {
        idEnfermedad: 'trigo.fusarium_espiga',
        enfermedad: 'Fusarium de la Espiga',
        perfil: 'MS',
        multiplicador: 0.75,
        estado: 'observada',
        confianza: 'alta',
        campaniaFuente: '2025-2026',
      },
    ],
  } as ISemilla;

  it('usa factor de susceptibilidad v4 en roya de hoja y conserva trazabilidad', async () => {
    const service = new RoyaDeLaHojaService();
    const anterior = {
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          idEnfermedad: 'trigo.roya_hoja',
          resultado: 0,
          estado: 'calculado',
          modelo: {
            id: 'trigo.roya_hoja',
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            fuente: 'test',
          },
          variables: { GD: 50, DHR: 5 },
        },
      ],
    } as IPrediccion;

    const result = await service.predecir(
      semilla,
      { precip: 0, hr: 80, Tavg: 15 },
      anterior,
      true,
      contexto,
    );

    expect(result.resultado).toBeCloseTo(25.16, 2);
    expect((result.variables as any).factorSusceptibilidad).toBe(0.5);
    expect((result.variables as any).GDDBase0Siembra).toBe(850);
    expect(result.modelo?.version).toBe(TRIGO_MOTOR_SANITARIO_VERSION);
  });

  it('no continúa acumuladores de la formula v3', async () => {
    const service = new RoyaDeLaHojaService();
    const anterior = {
      enfermedades: [
        {
          enfermedad: 'Roya de la Hoja',
          idEnfermedad: 'trigo.roya_hoja',
          resultado: 90,
          estado: 'calculado',
          modelo: { id: 'trigo.roya_hoja', version: 3, fuente: 'legado' },
          variables: { GD: 500, DHR: 50 },
        },
      ],
    } as IPrediccion;

    const result = await service.predecir(
      semilla,
      { precip: 0, hr: 80, Tavg: 15 },
      anterior,
      true,
      contexto,
    );

    expect((result.variables as any).GD).toBe(3);
    expect((result.variables as any).DHR).toBe(1);
    expect(result.resultado).toBe(0);
  });

  it('conserva exacto el contrato en sombra y publica el ambiente horario', async () => {
    const service = new RoyaAnaranjadaService();
    const result = await service.predecir(
      semilla,
      { precip: 1, hr: 80, Tavg: 10 } as any,
      horasRoya,
      undefined,
      true,
      {
        ...contexto,
        calidadClima: {
          nivel: 'media',
          fuente: 'open_meteo',
          cobertura: 1,
          fallback: true,
          resumen: 'Serie horaria Open-Meteo.',
          limitaciones: [],
        },
      },
    );

    expect(result.estado).toBe('calculado');
    expect(result.resultado).toBe(0);
    expect((result.variables as any).resultadoContractualCrudo).toBeCloseTo(
      13.18,
      2,
    );
    expect((result.variables as any).frecuenciaAmbientalPct).toBe(0);
    expect(result.modelo?.validacion).toBe('experimental');
    expect(result.calidadDatos?.nivel).toBe('baja');
    expect(result.calidadDatos?.fuente).toBe('open_meteo');
  });

  it('conserva la ecuacion diaria solo en auditoria cuando no hay serie horaria de roya amarilla', async () => {
    const result = await new RoyaAnaranjadaService().predecir(
      semilla,
      { precip: 1, hr: 80, Tavg: 10, Tmin: 8, Tmax: 13 },
      [],
      undefined,
      true,
      {
        ...contexto,
        calidadClima: {
          nivel: 'media',
          fuente: 'open_meteo',
          cobertura: 1,
          resumen: 'Agregado diario completo.',
          limitaciones: [],
        },
      },
    );

    expect(result.estado).toBe('sin_datos');
    expect(result.resultado).toBe(0);
    expect((result.variables as any).resultadoContractualLimitado).toBeCloseTo(
      13.18,
      2,
    );
    expect(result.modelo).toMatchObject({
      validacion: 'experimental',
      resolucion: 'proxy_diario',
    });
    expect(result.calidadDatos?.nivel).toBe('baja');
    expect(result.calidadDatos?.resumen).toContain('Cobertura horaria insuficiente');
  });

  it('respeta fronteras estrictas de lluvia en las manchas', async () => {
    const amarilla = await new ManchaAmarillaService().predecir(
      semilla,
      { precip: 2, hr: 80, Tmax: 30, Tmin: 10 },
      undefined,
      true,
      contexto,
    );
    expect((amarilla.variables as any).DPr).toBe(0);
    expect((amarilla.variables as any).DPrHRT).toBe(1);

    const amarillaUno = await new ManchaAmarillaService().predecir(
      semilla,
      { precip: 1, hr: 80, Tmax: 30, Tmin: 10 },
      undefined,
      true,
      contexto,
    );
    expect((amarillaUno.variables as any).DPr).toBe(0);
    expect((amarillaUno.variables as any).DPrHRT).toBe(0);

    const hoja = await new ManchaDeLaHojaService().predecir(
      semilla,
      { precip: 10, hr: 80 },
      undefined,
      true,
      contexto,
    );
    expect((hoja.variables as any).DPr).toBe(0);
    expect((hoja.variables as any).DHR).toBe(1);
  });

  it('interpreta I de Fusarium como incidencia y usa GDD base cero', async () => {
    const service = new FusariumDeLaEspigaService();
    const anterior = {
      enfermedades: [
        {
          enfermedad: 'Fusarium de la Espiga',
          idEnfermedad: 'trigo.fusarium_espiga',
          resultado: 0,
          estado: 'calculado',
          modelo: {
            id: 'trigo.fusarium_espiga',
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            fuente: 'test',
          },
          variables: { PMoj: 0, GDN: 0, GDAcum: 100 },
        },
      ],
    } as IPrediccion;

    const result = await service.predecir(
      semilla,
      {
        precip: 0,
        precipAnterior: 0.2,
        hr: 78,
        hrAnterior: 82,
        Tavg: -5,
        Tmin: -10,
        Tmax: -1,
      },
      anterior,
      true,
    );

    expect((result.variables as any).PMoj).toBe(1);
    expect((result.variables as any).GDAcum).toBe(100);
    expect(result.resultado).toBeCloseTo(14.77, 2);
    expect(result.modelo?.alcance).toContain('Incidencia');
  });

  it('calcula Fusarium como screening no alertable si la antesis es proyectada', async () => {
    const result = await new FusariumDeLaEspigaService().predecir(
      semilla,
      {
        precip: 0,
        precipAnterior: 0.4,
        hr: 80,
        hrAnterior: 85,
        Tavg: 15,
        Tmin: 10,
        Tmax: 22,
      },
      undefined,
      true,
      {
        ...contexto,
        etapa: 5,
        fenologiaObservada: false,
        calidadClima: {
          nivel: 'media',
          fuente: 'open_meteo',
          cobertura: 1,
          resumen: 'Agregado diario completo.',
          limitaciones: [],
        },
      },
    );

    expect(result.estado).toBe('calculado');
    expect(result.calidadDatos?.nivel).toBe('baja');
    expect(result.calidadDatos?.resumen).toContain('Antesis proyectada');
    expect(result.calidadDatos?.limitaciones?.join(' ')).toContain(
      'sin alerta automatica',
    );
  });

  it('cierra el calculo de Fusarium al alcanzar 530 GDD', async () => {
    const service = new FusariumDeLaEspigaService();
    const anterior = {
      enfermedades: [
        {
          enfermedad: 'Fusarium de la Espiga',
          idEnfermedad: 'trigo.fusarium_espiga',
          resultado: 20,
          estado: 'calculado',
          modelo: {
            id: 'trigo.fusarium_espiga',
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            fuente: 'test',
          },
          variables: { PMoj: 2, GDN: 0, GDAcum: 530 },
        },
      ],
    } as IPrediccion;

    const result = await service.predecir(
      semilla,
      {
        precip: 1,
        precipAnterior: 1,
        hr: 90,
        hrAnterior: 90,
        Tavg: null,
        Tmin: 10,
        Tmax: 20,
      } as any,
      anterior,
      true,
    );

    expect(result.estado).toBe('fuera_ventana');
    expect(result.resultado).toBe(0);
  });

  it('no convierte ausencias climaticas a cero y valida rangos fisicos', () => {
    expect(
      camposClimaticosFaltantes(
        {
          precip: null,
          hr: '',
          hrAnterior: 101,
          Tmin: 15,
          Tavg: 12,
          Tmax: 10,
        },
        ['precip', 'hr', 'hrAnterior', 'Tmin', 'Tavg', 'Tmax'],
      ),
    ).toEqual(
      expect.arrayContaining([
        'precip',
        'hr',
        'hrAnterior',
        'Tmin',
        'Tavg',
        'Tmax',
      ]),
    );
    expect(camposClimaticosFaltantes({ precip: -0.1 }, ['precip'])).toEqual([
      'precip',
    ]);
  });

  it('conserva acumuladores v4 durante un gap y continua al dia siguiente', async () => {
    const service = new ManchaAmarillaService();
    const anterior = {
      enfermedades: [
        {
          enfermedad: 'Mancha Amarilla',
          idEnfermedad: 'trigo.mancha_amarilla',
          resultado: 10,
          estado: 'calculado',
          modelo: {
            id: 'trigo.mancha_amarilla',
            version: TRIGO_MOTOR_SANITARIO_VERSION,
            fuente: 'test',
          },
          variables: { DPr: 4, DPrHRT: 3, resultadoCrudo: 10 },
        },
      ],
    } as IPrediccion;

    const gap = await service.predecir(
      semilla,
      { precip: null, hr: 85, Tmin: 10, Tmax: 25 } as any,
      anterior,
      true,
      { ...contexto, gddBase0DesdeSiembra: 900 },
    );
    expect(gap.estado).toBe('sin_datos');
    expect(gap.variables).toMatchObject({
      DPr: 4,
      DPrHRT: 3,
      GDDBase0Siembra: 900,
      formulaVersion: TRIGO_MOTOR_SANITARIO_VERSION,
    });

    const siguiente = await service.predecir(
      semilla,
      { precip: 3, hr: 85, Tmin: 10, Tmax: 25 },
      { enfermedades: [gap] } as IPrediccion,
      true,
      { ...contexto, gddBase0DesdeSiembra: 920 },
    );
    expect(siguiente.variables).toMatchObject({ DPr: 5, DPrHRT: 4 });
  });

  it('preserva acumuladores de los otros cuatro motores ante un dia incompleto', async () => {
    const anterior = (
      enfermedad: any,
      idEnfermedad: any,
      variables: Record<string, number>,
    ) =>
      ({
        enfermedades: [
          {
            enfermedad,
            idEnfermedad,
            resultado: 20,
            estado: 'calculado',
            modelo: {
              id: idEnfermedad,
              version: TRIGO_MOTOR_SANITARIO_VERSION,
              fuente: 'test',
            },
            variables,
          },
        ],
      }) as IPrediccion;

    const mancha = await new ManchaDeLaHojaService().predecir(
      semilla,
      { precip: 1, hr: undefined } as any,
      anterior('Mancha de la Hoja', 'trigo.mancha_hoja', {
        DPr: 2,
        DHR: 4,
      }),
      true,
      contexto,
    );
    expect(mancha.estado).toBe('sin_datos');
    expect(mancha.variables).toMatchObject({ DPr: 2, DHR: 4 });

    const roya = await new RoyaDeLaHojaService().predecir(
      semilla,
      { precip: null, hr: 80, Tavg: 15 } as any,
      anterior('Roya de la Hoja', 'trigo.roya_hoja', { GD: 10, DHR: 2 }),
      true,
      contexto,
    );
    expect(roya.estado).toBe('sin_datos');
    expect(roya.variables).toMatchObject({ GD: 10, DHR: 2 });

    const experimental = await new RoyaAnaranjadaService().predecir(
      semilla,
      { precip: 1, hr: '', Tavg: 10 } as any,
      [],
      anterior('Roya Anaranjada', 'trigo.roya_anaranjada', {
        GD: 8,
        DHR: 3,
        DL: 2,
      }),
      true,
      contexto,
    );
    expect(experimental.estado).toBe('sin_datos');
    expect(experimental.variables).toMatchObject({ GD: 8, DHR: 3, DL: 2 });

    const fusarium = await new FusariumDeLaEspigaService().predecir(
      semilla,
      {
        precip: 0,
        precipAnterior: 1,
        hr: 80,
        hrAnterior: 85,
        Tavg: undefined,
        Tmin: 10,
        Tmax: 20,
      } as any,
      anterior('Fusarium de la Espiga', 'trigo.fusarium_espiga', {
        PMoj: 2,
        GDN: 3,
        GDAcum: 100,
      }),
      true,
    );
    expect(fusarium.estado).toBe('sin_datos');
    expect(fusarium.variables).toMatchObject({
      PMoj: 2,
      GDN: 3,
      GDAcum: 100,
      diasClimaEsperados: 1,
      diasClimaValidos: 0,
      coberturaClima: 0,
    });

    const recuperacion = await new FusariumDeLaEspigaService().predecir(
      semilla,
      {
        precip: 0,
        precipAnterior: 1,
        hr: 80,
        hrAnterior: 85,
        Tavg: 15,
        Tmin: 10,
        Tmax: 20,
      },
      { enfermedades: [fusarium] } as IPrediccion,
      true,
      {
        ...contexto,
        calidadClima: {
          nivel: 'alta',
          fuente: 'estacion_asignada',
          cobertura: 1,
          resumen: 'Estacion completa.',
          limitaciones: [],
        },
      },
    );
    expect(recuperacion.variables).toMatchObject({
      diasClimaEsperados: 2,
      diasClimaValidos: 1,
      coberturaClima: 0.5,
    });
    expect(recuperacion.calidadDatos?.nivel).toBe('baja');
  });

  it('el marcador fuera de ventana conserva variables y nunca deja resultado activo', () => {
    const anterior = {
      enfermedad: 'Roya de la Hoja',
      idEnfermedad: 'trigo.roya_hoja',
      resultado: 30,
      estado: 'calculado',
      modelo: {
        id: 'trigo.roya_hoja',
        version: TRIGO_MOTOR_SANITARIO_VERSION,
        fuente: 'test',
      },
      variables: { GD: 20, DHR: 4 },
    } as any;
    const marcador = crearPrediccionFueraVentana(
      'Roya de la Hoja',
      'trigo.roya_hoja',
      'Etapa cerrada.',
      'test',
      TRIGO_MOTOR_SANITARIO_VERSION,
      'operativo_provisional',
      { GDDBase0Siembra: 1000 },
      anterior,
    );
    expect(marcador).toMatchObject({
      estado: 'fuera_ventana',
      resultado: 0,
      variables: { GD: 20, DHR: 4, GDDBase0Siembra: 1000 },
    });
  });

  it('propaga la peor calidad climatica y degrada campañas varietales antiguas', async () => {
    const roya = await new RoyaDeLaHojaService().predecir(
      semilla,
      { precip: 0, hr: 80, Tavg: 15 },
      undefined,
      true,
      {
        ...contexto,
        calidadClima: {
          nivel: 'baja',
          fuente: 'estacion_cercana',
          cobertura: 0.8,
          distanciaKm: 65,
          fallback: true,
          resumen: 'Estacion distante.',
          limitaciones: ['Distancia elevada.'],
        },
      },
    );
    expect(roya.calidadClima?.distanciaKm).toBe(65);
    expect(roya.calidadDatos?.nivel).toBe('baja');
    expect(roya.calidadDatos?.limitaciones).toContain('Distancia elevada.');

    const manchaHoja = await new ManchaDeLaHojaService().predecir(
      semilla,
      { precip: 11, hr: 80 },
      undefined,
      true,
      contexto,
    );
    expect(manchaHoja.calidadDatos?.nivel).toBe('baja');
    expect(
      manchaHoja.calidadDatos?.limitaciones.some((item) =>
        item.includes('campaña antigua'),
      ),
    ).toBe(true);
  });
});
