import { IPrediccion } from 'modelos/src';
import { construirSeriesSanitariasTrigo, seleccionarSeriesVigentesTrigo } from './serie-sanitaria-trigo';

describe('construirSeriesSanitariasTrigo', () => {
  it('agrupa aliases por enfermedad canonica y separa versiones', () => {
    const predicciones = [
      prediccion('2026-07-10', {
        enfermedad: 'Roya anaranjada de la hoja',
        resultado: 18,
        modelo: { id: 'legacy', version: 3, fuente: 'v3' },
      }),
      prediccion('2026-07-11', {
        enfermedad: 'Roya de la Hoja',
        idEnfermedad: 'trigo.roya_hoja',
        resultado: 21,
        estado: 'calculado',
        modelo: { id: 'trigo.roya_hoja', version: 4, fuente: 'v4' },
      }),
    ];

    const series = construirSeriesSanitariasTrigo(predicciones);
    const royaHoja = series.filter((serie) => serie.idEnfermedad === 'trigo.roya_hoja');
    const versionActual = series.filter((serie) => serie.versionEtiqueta === 'v4');

    expect(royaHoja.map((serie) => serie.versionEtiqueta)).toEqual(['v3', 'v4']);
    expect(versionActual.map((serie) => serie.idEnfermedad)).toEqual([
      'trigo.mancha_amarilla',
      'trigo.roya_hoja',
      'trigo.roya_anaranjada',
      'trigo.mancha_hoja',
      'trigo.fusarium_espiga',
    ]);
  });

  it('representa estados no calculables como huecos y conserva un cero calculado', () => {
    const predicciones = [
      prediccion('2026-07-10', enfermedadV4(12, 'calculado')),
      prediccion('2026-07-11', enfermedadV4(0, 'fuera_ventana')),
      prediccion('2026-07-12', enfermedadV4(0, 'calculado')),
      prediccion('2026-07-13', {
        ...enfermedadV4(30, 'calculado'),
        calidadDatos: { nivel: 'baja', fuente: 'mixto' },
      }),
    ];

    const serie = construirSeriesSanitariasTrigo(predicciones).find((item) => item.idEnfermedad === 'trigo.roya_hoja')!;

    expect(serie.data.map((punto) => punto[1])).toEqual([12, null, 0, null]);
  });

  it('corta la linea cuando faltan dias completos', () => {
    const predicciones = [
      prediccion('2026-07-10', enfermedadV4(12, 'calculado')),
      prediccion('2026-07-13', enfermedadV4(20, 'calculado')),
    ];

    const serie = construirSeriesSanitariasTrigo(predicciones).find((item) => item.idEnfermedad === 'trigo.roya_hoja')!;

    expect(serie.data.map((punto) => punto[1])).toEqual([12, null, 20]);
  });

  it('conserva las cinco enfermedades en la leyenda sin inventar valores faltantes', () => {
    const series = construirSeriesSanitariasTrigo([
      prediccion('2026-07-10', enfermedadV4(0, 'sin_datos')),
      prediccion('2026-07-11', enfermedadV4(0, 'fuera_ventana')),
    ]);
    const royaHoja = series.find((serie) => serie.idEnfermedad === 'trigo.roya_hoja')!;

    expect(series.map((serie) => serie.idEnfermedad)).toEqual([
      'trigo.mancha_amarilla',
      'trigo.roya_hoja',
      'trigo.roya_anaranjada',
      'trigo.mancha_hoja',
      'trigo.fusarium_espiga',
    ]);
    expect(royaHoja.tieneLecturas).toBeFalse();
    expect(royaHoja.data.map((punto) => punto[1])).toEqual([null, null]);
  });

  it('muestra la nomenclatura correcta aunque el dato conserve el id legado', () => {
    const serie = construirSeriesSanitariasTrigo([
      prediccion('2026-07-10', {
        enfermedad: 'Roya Anaranjada',
        idEnfermedad: 'trigo.roya_anaranjada',
        resultado: 15,
        estado: 'calculado',
        calidadDatos: { nivel: 'media', fuente: 'open_meteo' },
        modelo: {
          id: 'trigo.roya_anaranjada',
          version: 4,
          fuente: 'El Jarroudi 2017',
          resolucion: 'horaria',
          validacion: 'experimental',
        },
      }),
    ]).find((item) => item.idEnfermedad === 'trigo.roya_anaranjada')!;

    expect(serie.idEnfermedad).toBe('trigo.roya_anaranjada');
    expect(serie.nombre).toBe('Roya Amarilla/Estriada');
  });

  it('selecciona una sola curva vigente por enfermedad sin perder la version mas reciente', () => {
    const series = construirSeriesSanitariasTrigo([
      prediccion('2026-07-10', enfermedadV4(12, 'calculado')),
      prediccion('2026-07-11', {
        ...enfermedadV4(21, 'calculado'),
        modelo: { id: 'trigo.roya_hoja', version: 5, fuente: 'contrato v5' },
      }),
    ]);

    const seleccionadas = seleccionarSeriesVigentesTrigo(series);
    const royaHoja = seleccionadas.filter((serie) => serie.idEnfermedad === 'trigo.roya_hoja');

    expect(seleccionadas.length).toBe(5);
    expect(royaHoja.length).toBe(1);
    expect(royaHoja[0].versionEtiqueta).toBe('v5');
  });
});

function prediccion(fecha: string, enfermedad: any): IPrediccion {
  return {
    fecha: `${fecha}T03:00:00.000Z`,
    enfermedades: [enfermedad],
  } as IPrediccion;
}

function enfermedadV4(resultado: number, estado: 'calculado' | 'sin_datos' | 'fuera_ventana') {
  return {
    enfermedad: 'Roya de la Hoja',
    idEnfermedad: 'trigo.roya_hoja',
    resultado,
    estado,
    modelo: {
      id: 'trigo.roya_hoja',
      version: 4,
      fuente: 'contrato v4',
    },
  };
}
