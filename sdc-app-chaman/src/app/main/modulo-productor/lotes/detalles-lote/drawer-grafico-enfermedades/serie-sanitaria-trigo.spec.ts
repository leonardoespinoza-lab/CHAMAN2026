import { IPrediccion } from 'modelos/src';
import { construirSeriesSanitariasTrigo } from './serie-sanitaria-trigo';

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

    expect(series.length).toBe(2);
    expect(series.map((serie) => serie.idEnfermedad)).toEqual(['trigo.roya_hoja', 'trigo.roya_hoja']);
    expect(series.map((serie) => serie.versionEtiqueta)).toEqual(['v3', 'v4']);
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

    const [serie] = construirSeriesSanitariasTrigo(predicciones);

    expect(serie.data.map((punto) => punto[1])).toEqual([12, null, 0, null]);
  });

  it('corta la linea cuando faltan dias completos', () => {
    const predicciones = [
      prediccion('2026-07-10', enfermedadV4(12, 'calculado')),
      prediccion('2026-07-13', enfermedadV4(20, 'calculado')),
    ];

    const [serie] = construirSeriesSanitariasTrigo(predicciones);

    expect(serie.data.map((punto) => punto[1])).toEqual([12, null, 20]);
  });

  it('no crea una leyenda para una serie que nunca tuvo una lectura valida', () => {
    const series = construirSeriesSanitariasTrigo([
      prediccion('2026-07-10', enfermedadV4(0, 'sin_datos')),
      prediccion('2026-07-11', enfermedadV4(0, 'fuera_ventana')),
    ]);

    expect(series).toEqual([]);
  });

  it('muestra la nomenclatura correcta aunque el dato conserve el id legado', () => {
    const [serie] = construirSeriesSanitariasTrigo([
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
    ]);

    expect(serie.idEnfermedad).toBe('trigo.roya_anaranjada');
    expect(serie.nombre).toBe('Roya Amarilla/Estriada');
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
