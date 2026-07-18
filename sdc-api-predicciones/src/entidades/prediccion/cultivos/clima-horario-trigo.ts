import {
  ICalidadDatoMotor,
  IClimaEstacionMeteorologica,
  IHoraRoyaAmarilla,
} from 'modelos/src';

const finito = (value: unknown): value is number =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  typeof value !== 'boolean' &&
  Number.isFinite(Number(value));

const numero = (value: unknown): number | undefined =>
  finito(value) ? Number(value) : undefined;

const dia = (fecha?: string): string => String(fecha || '').split('T')[0];

function puntajeCompletitud(item: IClimaEstacionMeteorologica): number {
  return [
    item.temperatura?.avg ?? item.temperatura?.last,
    item.humedad?.avg ?? item.humedad?.last,
    item.lluvia?.sum ?? item.lluvia?.last ?? item.lluvia?.result,
    item.velocidadViento?.avg ?? item.velocidadViento?.last,
  ].filter((value) => numero(value) !== undefined).length;
}

function deduplicarPorInstante(
  filas: IClimaEstacionMeteorologica[],
): IClimaEstacionMeteorologica[] {
  const unicas = new Map<string, IClimaEstacionMeteorologica>();
  for (const fila of filas || []) {
    const instante = new Date(String(fila?.fecha || ''));
    if (!Number.isFinite(instante.getTime())) continue;
    // La cobertura es por hora civil única, no por cantidad de paquetes. Dos
    // lecturas dentro de la misma hora nunca equivalen a dos horas cubiertas.
    const hora = instante.toISOString().slice(0, 13);
    const previa = unicas.get(hora);
    if (!previa || puntajeCompletitud(fila) > puntajeCompletitud(previa)) {
      unicas.set(hora, fila);
    }
  }
  return [...unicas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, fila]) => fila);
}

function promedio(valores: number[]): number | undefined {
  if (!valores.length) return undefined;
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
}

function peorNivel(
  niveles: Array<ICalidadDatoMotor['nivel'] | undefined>,
): ICalidadDatoMotor['nivel'] {
  const orden: ICalidadDatoMotor['nivel'][] = [
    'alta',
    'media',
    'baja',
    'sin_datos',
  ];
  return niveles.reduce<ICalidadDatoMotor['nivel']>(
    (peor, actual) =>
      orden.indexOf(actual || 'media') > orden.indexOf(peor)
        ? actual || 'media'
        : peor,
    'alta',
  );
}

/**
 * Convierte observaciones horarias en un unico registro diario. Temperatura y
 * HR son promedios de todas las horas validas; Tmin/Tmax son extremos; lluvia
 * es suma. Nunca toma la primera hora como representacion del dia.
 */
export function agregarClimaHorarioPorDia(
  filas: IClimaEstacionMeteorologica[],
): IClimaEstacionMeteorologica[] {
  const grupos = new Map<string, IClimaEstacionMeteorologica[]>();
  for (const fila of deduplicarPorInstante(filas || [])) {
    const clave = dia(fila.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) continue;
    grupos.set(clave, [...(grupos.get(clave) || []), fila]);
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, registros]) => {
      const temperaturas = registros
        .map((item) => numero(item.temperatura?.avg ?? item.temperatura?.last))
        .filter((item): item is number => item !== undefined);
      const minimas = registros
        .flatMap((item) => [
          numero(item.temperatura?.min),
          numero(item.temperatura?.avg ?? item.temperatura?.last),
        ])
        .filter((item): item is number => item !== undefined);
      const maximas = registros
        .flatMap((item) => [
          numero(item.temperatura?.max),
          numero(item.temperatura?.avg ?? item.temperatura?.last),
        ])
        .filter((item): item is number => item !== undefined);
      const humedades = registros
        .map((item) => numero(item.humedad?.avg ?? item.humedad?.last))
        .filter((item): item is number => item !== undefined);
      const lluvias = registros
        .map((item) =>
          numero(item.lluvia?.sum ?? item.lluvia?.last ?? item.lluvia?.result),
        )
        .filter((item): item is number => item !== undefined);
      const vientos = registros
        .map((item) =>
          numero(item.velocidadViento?.avg ?? item.velocidadViento?.last),
        )
        .filter((item): item is number => item !== undefined);
      const registrosHorariosValidos = registros.filter(
        (item) =>
          numero(item.temperatura?.avg ?? item.temperatura?.last) !==
            undefined &&
          numero(item.humedad?.avg ?? item.humedad?.last) !== undefined &&
          numero(item.lluvia?.sum ?? item.lluvia?.last) !== undefined,
      ).length;
      const esSerieHoraria = registros.length > 1;
      const cobertura = esSerieHoraria
        ? Math.min(1, registrosHorariosValidos / 24)
        : Math.min(
            1,
            Math.max(0, Number(registros[0]?.calidadDatos?.cobertura ?? 1)),
          );
      const nivelDeclarado = peorNivel(
        registros.map((item) => item.calidadDatos?.nivel),
      );
      const nivel: ICalidadDatoMotor['nivel'] =
        esSerieHoraria && registrosHorariosValidos < 24
          ? 'baja'
          : nivelDeclarado;
      const primera = registros[0];

      return {
        fuente: primera?.fuente,
        estacion: primera?.estacion,
        ubicacion: primera?.ubicacion,
        distancia: primera?.distancia,
        fecha: `${fecha}T12:00:00.000Z`,
        temperatura: {
          avg: promedio(temperaturas),
          min: minimas.length ? Math.min(...minimas) : undefined,
          max: maximas.length ? Math.max(...maximas) : undefined,
        },
        humedad: {
          avg: promedio(humedades),
          min: humedades.length ? Math.min(...humedades) : undefined,
          max: humedades.length ? Math.max(...humedades) : undefined,
        },
        lluvia: {
          sum: lluvias.length
            ? +lluvias.reduce((suma, valor) => suma + valor, 0).toFixed(4)
            : undefined,
        },
        velocidadViento: { avg: promedio(vientos) },
        calidadDatos: {
          nivel,
          fuente:
            primera?.calidadDatos?.fuente ||
            (primera?.fuente === 'OpenMeteo'
              ? 'open_meteo'
              : 'estacion_cercana'),
          cobertura,
          distanciaKm: primera?.calidadDatos?.distanciaKm,
          fallback: registros.some((item) => item.calidadDatos?.fallback),
          resumen: esSerieHoraria
            ? `Agregado diario calculado con ${registrosHorariosValidos} horas meteorologicas validas.`
            : 'Agregado diario provisto por la fuente meteorologica.',
          limitaciones: [
            ...new Set(
              registros.flatMap(
                (item) => item.calidadDatos?.limitaciones || [],
              ),
            ),
            ...(esSerieHoraria
              ? []
              : [
                  'No existe resolucion horaria suficiente para evaluar rachas de roya amarilla.',
                ]),
          ],
        },
      };
    });
}

/** Selecciona las observaciones horarias reales de los diez dias civiles. */
export function ventanaHorariaRoyaAmarilla(
  filas: IClimaEstacionMeteorologica[],
  fechaObjetivo: Date,
): IHoraRoyaAmarilla[] {
  const fin = fechaObjetivo.toISOString().split('T')[0];
  const inicioDate = new Date(`${fin}T12:00:00.000Z`);
  inicioDate.setUTCDate(inicioDate.getUTCDate() - 9);
  const inicio = inicioDate.toISOString().split('T')[0];
  const porDia = new Map<string, IClimaEstacionMeteorologica[]>();
  for (const fila of deduplicarPorInstante(filas || [])) {
    const fecha = dia(fila.fecha);
    if (fecha < inicio || fecha > fin) continue;
    porDia.set(fecha, [...(porDia.get(fecha) || []), fila]);
  }

  return [...porDia.entries()]
    .filter(([, registros]) => registros.length >= 22)
    .flatMap(([, registros]) => registros)
    .map((item) => ({
      fecha: String(item.fecha || ''),
      temperatura: numero(item.temperatura?.avg ?? item.temperatura?.last),
      humedadRelativa: numero(item.humedad?.avg ?? item.humedad?.last),
      lluviaMm: numero(
        item.lluvia?.sum ?? item.lluvia?.last ?? item.lluvia?.result,
      ),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
