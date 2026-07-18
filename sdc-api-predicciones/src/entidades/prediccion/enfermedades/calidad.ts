import {
  IContextoVentanaSanitariaTrigo,
  ICalidadDatoMotor,
  IPrediccionEnfermedad,
  TRIGO_GDD_COBERTURA_MINIMA,
  TEnfermedad,
  TEnfermedadId,
  campaniaAOrden,
} from 'modelos/src';
import { IResistenciaResuelta } from 'modelos/src';

export function camposClimaticosFaltantes(
  clima: Record<string, unknown>,
  campos: string[],
): string[] {
  const invalidos = campos.filter((campo) => {
    const valor = clima[campo];
    if (!esValorClimaticoValido(valor)) return true;
    const numero = Number(valor);
    if (/^hr/i.test(campo)) return numero < 0 || numero > 100;
    if (/^precip/i.test(campo)) return numero < 0;
    return false;
  });

  const tiene = (campo: string) =>
    campos.includes(campo) && esValorClimaticoValido(clima[campo]);
  if (tiene('Tmin') && tiene('Tmax')) {
    const tmin = Number(clima.Tmin);
    const tmax = Number(clima.Tmax);
    if (tmin > tmax) invalidos.push('Tmin', 'Tmax');
    if (tiene('Tavg')) {
      const tavg = Number(clima.Tavg);
      if (tavg < tmin || tavg > tmax) invalidos.push('Tavg');
    }
  }

  return Array.from(new Set(invalidos));
}

/**
 * Valida una observacion climatica sin convertir ausencias a cero.
 * `Number(null)` y `Number('')` son 0, pero ambos representan datos faltantes
 * y no una medicion meteorologica real.
 */
export function esValorClimaticoValido(valor: unknown): boolean {
  if (valor === null || valor === undefined || typeof valor === 'boolean') {
    return false;
  }
  if (typeof valor === 'string' && valor.trim() === '') return false;
  return Number.isFinite(Number(valor));
}

export function combinarCalidadDatos(
  base?: ICalidadDatoMotor,
  adicional?: ICalidadDatoMotor,
): ICalidadDatoMotor | undefined {
  if (!base) return adicional ? { ...adicional } : undefined;
  if (!adicional) return { ...base };
  const orden = { sin_datos: 0, baja: 1, media: 2, alta: 3 } as const;
  const peor =
    orden[base.nivel] <= orden[adicional.nivel] ? base.nivel : adicional.nivel;
  const coberturas = [base.cobertura, adicional.cobertura].filter(
    (valor): valor is number => typeof valor === 'number' && isFinite(valor),
  );
  const distancias = [base.distanciaKm, adicional.distanciaKm].filter(
    (valor): valor is number => typeof valor === 'number' && isFinite(valor),
  );
  return {
    nivel: peor,
    fuente: base.fuente === adicional.fuente ? base.fuente : ('mixto' as const),
    cobertura: coberturas.length ? Math.min(...coberturas) : undefined,
    distanciaKm: distancias.length ? Math.max(...distancias) : undefined,
    fallback: Boolean(base.fallback || adicional.fallback),
    resumen: Array.from(
      new Set([base.resumen, adicional.resumen].filter(Boolean)),
    ).join(' '),
    limitaciones: Array.from(
      new Set([
        ...(base.limitaciones || []),
        ...(adicional.limitaciones || []),
      ]),
    ),
  };
}

export function crearPrediccionSinDatos(
  enfermedad: TEnfermedad,
  idEnfermedad: TEnfermedadId,
  faltantes: string[],
  fuenteModelo: string,
  versionModelo = 3,
  validacion:
    'operativo' | 'operativo_provisional' | 'experimental' = 'operativo',
  variablesAcumuladas: IPrediccionEnfermedad['variables'] = {},
): IPrediccionEnfermedad {
  return {
    enfermedad,
    idEnfermedad,
    resultado: 0,
    estado: 'sin_datos',
    calidadDatos: {
      nivel: 'sin_datos',
      fuente: 'desconocida',
      cobertura: 0,
      resumen:
        'Predicción no calculada por variables climáticas faltantes o inválidas.',
      limitaciones: faltantes.map(
        (campo) => `Falta o tiene un valor inválido: ${campo}`,
      ),
    },
    modelo: {
      id: idEnfermedad,
      version: versionModelo,
      fuente: fuenteModelo,
      validacion,
    },
    variables: {
      ...(variablesAcumuladas as Record<string, number>),
      formulaVersion: versionModelo,
    },
  };
}

/**
 * Persiste de forma explicita el cierre (o la no apertura) de una ventana
 * sanitaria. Mantiene los acumuladores del ultimo registro v4 para que un dia
 * fuera de ventana nunca corte la trazabilidad ni reactive el modelo desde 0.
 */
export function crearPrediccionFueraVentana(
  enfermedad: TEnfermedad,
  idEnfermedad: TEnfermedadId,
  motivo: string,
  fuenteModelo: string,
  versionModelo = 3,
  validacion:
    'operativo' | 'operativo_provisional' | 'experimental' = 'operativo',
  variables: IPrediccionEnfermedad['variables'] = {},
  anterior?: IPrediccionEnfermedad,
): IPrediccionEnfermedad {
  const calidadAnterior = anterior?.calidadDatos;
  const limitaciones = Array.from(
    new Set([...(calidadAnterior?.limitaciones || []), motivo]),
  );

  return {
    enfermedad,
    idEnfermedad,
    resultado: 0,
    estado: 'fuera_ventana',
    resistenciaUsada: anterior?.resistenciaUsada,
    calidadClima: anterior?.calidadClima,
    calidadDatos: {
      nivel: calidadAnterior?.nivel || 'media',
      fuente: calidadAnterior?.fuente || 'mixto',
      cobertura: calidadAnterior?.cobertura ?? 0,
      fallback: calidadAnterior?.fallback,
      resumen: 'Modelo sanitario fuera de su ventana de calculo.',
      limitaciones,
    },
    modelo: {
      ...anterior?.modelo,
      id: idEnfermedad,
      version: versionModelo,
      fuente: fuenteModelo,
      validacion,
      alcance: motivo,
    },
    variables: {
      ...((anterior?.variables || {}) as Record<string, number>),
      ...(variables as Record<string, number>),
      formulaVersion: versionModelo,
    },
  };
}

export function metadataSanitariaTrigo(
  resuelta: IResistenciaResuelta,
  contexto: IContextoVentanaSanitariaTrigo,
  experimental = false,
) {
  const base = metadataResistencia(resuelta);
  const cobertura = Math.min(
    1,
    Math.max(0, Number(contexto.coberturaGdd) || 0),
  );
  const coberturaSuficiente =
    contexto.fenologiaObservada || cobertura >= TRIGO_GDD_COBERTURA_MINIMA;
  const limitaciones = [
    ...(base.calidadDatos.limitaciones || []),
    ...(coberturaSuficiente
      ? []
      : [
          `Cobertura termica desde siembra insuficiente (${(
            cobertura * 100
          ).toFixed(0)}%).`,
        ]),
    ...(experimental
      ? [
          'Modelo experimental con fuente cientifica, sin validacion regional argentina; no emite alertas automaticas.',
        ]
      : []),
  ];
  const calidadModelo: ICalidadDatoMotor = {
    ...base.calidadDatos,
    nivel:
      experimental || !coberturaSuficiente
        ? ('baja' as const)
        : base.calidadDatos.nivel,
    fuente: 'mixto' as const,
    cobertura: Math.min(base.calidadDatos.cobertura, cobertura),
    fallback:
      base.calidadDatos.fallback || !coberturaSuficiente || experimental,
    resumen: experimental
      ? 'Resultado experimental para evaluacion; no confirma presencia de enfermedad.'
      : `${base.calidadDatos.resumen} Ventana termica/fenologica verificada.`,
    limitaciones,
  };

  return {
    resistenciaUsada: base.resistenciaUsada,
    calidadClima: contexto.calidadClima,
    calidadDatos:
      combinarCalidadDatos(calidadModelo, contexto.calidadClima) ||
      calidadModelo,
  };
}

export function metadataSanitariaFusarium(
  resuelta: IResistenciaResuelta,
  coberturaVariables: number,
  calidadClima?: ICalidadDatoMotor,
  fenologiaObservada = true,
) {
  const base = metadataResistencia(resuelta);
  const cobertura = Math.min(1, Math.max(0, coberturaVariables || 0));
  const coberturaSuficiente = cobertura >= 0.9;
  const limitaciones = [
    ...(base.calidadDatos.limitaciones || []),
    ...(coberturaSuficiente
      ? []
      : [
          `Cobertura de variables meteorologicas requeridas para Fusarium insuficiente (${(
            cobertura * 100
          ).toFixed(0)}%; minimo 90%).`,
        ]),
    ...(!fenologiaObservada
      ? [
          'La antesis proviene de una proyeccion fenologica: se informa screening ambiental, sin alerta automatica hasta confirmar anteras visibles a campo.',
        ]
      : []),
  ];
  const calidadModelo: ICalidadDatoMotor = {
    ...base.calidadDatos,
    nivel:
      coberturaSuficiente && fenologiaObservada
        ? base.calidadDatos.nivel
        : 'baja',
    fuente: 'mixto',
    cobertura: Math.min(base.calidadDatos.cobertura, cobertura),
    fallback:
      base.calidadDatos.fallback || !coberturaSuficiente || !fenologiaObservada,
    resumen: `${base.calidadDatos.resumen} ${
      coberturaSuficiente
        ? 'Cobertura meteorologica especifica de Fusarium suficiente.'
        : 'Cobertura meteorologica especifica de Fusarium incompleta.'
    } ${
      fenologiaObservada
        ? 'Antesis confirmada a campo.'
        : 'Antesis proyectada; resultado de screening no alertable.'
    }`,
    limitaciones,
  };
  return {
    resistenciaUsada: base.resistenciaUsada,
    calidadClima,
    calidadDatos:
      combinarCalidadDatos(calidadModelo, calidadClima) || calidadModelo,
  };
}

export function metadataResistencia(resuelta: IResistenciaResuelta) {
  const resistencia = resuelta.resistencia;
  const ordenCampania = campaniaAOrden(resistencia?.campaniaFuente);
  const ultimoAnioCampania = ordenCampania ? ordenCampania % 10000 : undefined;
  const campaniaAntigua =
    ultimoAnioCampania !== undefined &&
    ultimoAnioCampania < new Date().getFullYear() - 2;
  const nivelConfianza = resuelta.desconocida
    ? ('sin_datos' as const)
    : resistencia?.confianza === 'alta'
      ? ('alta' as const)
      : resistencia?.confianza === 'media'
        ? ('media' as const)
        : resistencia?.confianza === 'baja'
          ? ('baja' as const)
          : ('sin_datos' as const);
  const nivel = campaniaAntigua ? ('baja' as const) : nivelConfianza;
  const limitaciones = Array.from(
    new Set([
      ...(resuelta.limitaciones || []),
      ...(resuelta.desconocida
        ? ['La ausencia de dato no equivale a susceptibilidad observada.']
        : []),
      ...(campaniaAntigua
        ? [
            `Resistencia varietal de una campaña antigua (${resistencia?.campaniaFuente}); requiere actualización.`,
          ]
        : []),
    ]),
  );
  return {
    resistenciaUsada: resistencia
      ? {
          idEnfermedad: resistencia.idEnfermedad,
          enfermedad: resistencia.enfermedad,
          multiplicador: resistencia.multiplicador,
          indiceResistencia: resistencia.indiceResistencia,
          perfil: resistencia.perfil,
          estado: resistencia.estado,
          confianza: resistencia.confianza,
          fuente: resistencia.fuente,
          fuenteUrl: resistencia.fuenteUrl,
          campaniaFuente: resistencia.campaniaFuente,
        }
      : { estado: 'desconocida' as const },
    calidadDatos: {
      nivel,
      fuente: 'catalogo' as const,
      cobertura: resuelta.desconocida ? 0 : 1,
      fallback:
        resuelta.desconocida ||
        campaniaAntigua ||
        nivel === 'baja' ||
        nivel === 'sin_datos',
      resumen: resuelta.desconocida
        ? 'Resistencia varietal no cargada: se usa el factor conservador susceptible para no subestimar el ambiente. No confirma presencia ni ausencia; requiere monitoreo a campo antes de definir manejo.'
        : `Resistencia varietal ${resistencia?.perfil || 'cargada'} de ${resistencia?.campaniaFuente || 'campaña no informada'}.`,
      limitaciones,
    },
  };
}
