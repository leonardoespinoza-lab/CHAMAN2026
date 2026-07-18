import { Injectable, Logger } from '@nestjs/common';
import {
  ICreatePrediccion,
  IPrediccion,
  IPrediccionEnfermedad,
  IQueryParam,
  ISemilla,
  ISiembra,
  IVariablesEnfermedadCebada,
  TEnfermedad,
  TEnfermedadId,
} from 'modelos/src';
import {
  acumularSeveridadManchaRed,
  calcularEscaldadura,
  calcularFusariumEspiga,
  calcularRoyaHoja,
  factorHumedadManchaRed,
  factorTemperaturaManchaRed,
  gradosDiaRoya,
  IHoraClimaEnfermedad,
  resolverResistencia,
  tasaDiariaManchaRedHoraria,
} from 'modelos/src';
import { HelperService } from '../../../auxiliares/helper';
import { SiembrasService } from '../../siembra/service';
import { ClimaService } from '../../clima/service';
import { FumigacionsService } from '../../fumigacion/service';
import { PrediccionsRepository } from '../repository';
import {
  camposClimaticosFaltantes,
  combinarCalidadDatos,
  crearPrediccionFueraVentana,
  crearPrediccionSinDatos,
  metadataResistencia,
} from '../enfermedades/calidad';
import {
  construirDiasSanitariosCanonicos,
  IDiaSanitarioCanonico,
} from './agrometeorologia-canonica';

type EnfermedadCebada = Extract<
  TEnfermedad,
  | 'Mancha en Red'
  | 'Escaldadura de la Cebada'
  | 'Roya de la Hoja de Cebada'
  | 'Fusariosis de la Espiga de Cebada'
>;

interface ConfigEnfermedadCebada {
  id: TEnfermedadId;
  nombre: EnfermedadCebada;
  etapaMin: number;
  etapaMax: number;
  formula: 'mancha_red' | 'escaldadura' | 'roya_hoja' | 'fusariosis';
}

interface ClimaDiaCebada {
  hr: number;
  hrAnterior: number;
  tavg: number;
  tmin: number;
  tmax: number;
  precip: number;
  precipAnterior: number;
  horas: IHoraClimaEnfermedad[];
  horasMojado: number;
  coberturaHoraria: number;
  resolucion: 'horaria' | 'proxy_diario';
}

@Injectable()
export class PrediccionCebadaService {
  private readonly enfermedades: ConfigEnfermedadCebada[] = [
    {
      id: 'cebada.mancha_red',
      nombre: 'Mancha en Red',
      etapaMin: 1,
      etapaMax: 5,
      formula: 'mancha_red',
    },
    {
      id: 'cebada.escaldadura',
      nombre: 'Escaldadura de la Cebada',
      etapaMin: 1,
      etapaMax: 4,
      formula: 'escaldadura',
    },
    {
      id: 'cebada.roya_hoja',
      nombre: 'Roya de la Hoja de Cebada',
      etapaMin: 2,
      etapaMax: 6,
      formula: 'roya_hoja',
    },
    {
      id: 'cebada.fusariosis_espiga',
      nombre: 'Fusariosis de la Espiga de Cebada',
      etapaMin: 4,
      etapaMax: 6,
      formula: 'fusariosis',
    },
  ];

  constructor(
    private prediccionsRepository: PrediccionsRepository,
    private siembrasService: SiembrasService,
    private climaService: ClimaService,
    private fumigacionsService: FumigacionsService,
  ) {}

  public async hacerPredicciones(siembra: ISiembra) {
    const prediccionesCreadas: IPrediccion[] = [];
    const ultimaPrediccion = await this.getUltimaPrediccion(siembra._id);
    let predAnterior = ultimaPrediccion;
    const inicioSiembra = new Date(siembra.fechaSiembra);
    inicioSiembra.setUTCHours(0, 0, 0, 0);
    const dateDesde = predAnterior?.fecha
      ? new Date(predAnterior.fecha)
      : new Date(inicioSiembra);
    if (predAnterior?.fecha) {
      dateDesde.setUTCHours(0, 0, 0, 0);
      dateDesde.setUTCDate(dateDesde.getUTCDate() + 1);
    }
    const dateHasta = this.diaActual();
    dateHasta.setUTCDate(dateHasta.getUTCDate() + 1);

    if (!dateDesde || dateDesde >= dateHasta) {
      return prediccionesCreadas;
    }

    Logger.log(
      `Creando predicciones Cebada desde ${dateDesde.toISOString()} hasta ${dateHasta.toISOString()}`,
    );

    const respuestaCanonica =
      await this.climaService.getAgrometeorologiaSiembra(
        siembra._id,
        inicioSiembra.toISOString(),
        dateHasta.toISOString(),
      );
    const diasCanonicos = construirDiasSanitariosCanonicos(
      respuestaCanonica,
      'Cebada',
    );

    if (!diasCanonicos.length) {
      Logger.warn(
        `No hay serie agrometeorologica canonica para Cebada entre ${inicioSiembra.toISOString()} y ${dateHasta.toISOString()}`,
      );
      return prediccionesCreadas;
    }
    const diasPorFecha = new Map(diasCanonicos.map((dia) => [dia.fecha, dia]));

    const fumigaciones = await this.fumigacionsService.getByIdSiembra(
      siembra._id,
    );
    const fechasFumigadas = HelperService.fechasFumigadas(fumigaciones.datos);
    let ultimaCreada: IPrediccion | undefined;

    for (const dia of diasCanonicos) {
      const fecha = new Date(`${dia.fecha}T03:00:00.000Z`);
      if (fecha < dateDesde || fecha >= dateHasta) continue;
      const fechaIso = fecha.toISOString();
      const predecir = !fechasFumigadas.includes(fechaIso);
      const etapa = dia.etapaNumero;
      const fechaAnterior = this.diaAnterior(fecha).toISOString().slice(0, 10);
      const climaDia = this.climaDiaCanonico(
        dia,
        diasPorFecha.get(fechaAnterior),
      );
      const enfermedades =
        !dia.climaHabilitante
          ? this.enfermedades.map((config) =>
              crearPrediccionSinDatos(
                config.nombre,
                config.id,
                dia.motivosNoHabilitante.length
                  ? dia.motivosNoHabilitante
                  : ['serie_agrometeorologica_canonica'],
                'ENFERMEDADES EN CEBADA.xlsx',
              ),
            )
          : this.enfermedades.map((config) => {
              const anterior = predAnterior?.enfermedades?.find(
                (item) => item.idEnfermedad === config.id,
              );
              if (etapa === undefined) {
                if (config.formula === 'fusariosis') {
                  return crearPrediccionFueraVentana(
                    config.nombre,
                    config.id,
                    'Fusariosis requiere confirmar espigazon/antesis; el clima se conserva sin declarar una ventana reproductiva.',
                    'ENFERMEDADES EN CEBADA.xlsx',
                    3,
                    'operativo_provisional',
                    { etapaScore: 0 },
                    anterior,
                  );
                }
                return this.predecirEnfermedad({
                  config,
                  semilla: siembra.semilla,
                  etapa: 1,
                  clima: climaDia,
                  prediccionAnterior: predAnterior,
                  predecir,
                });
              }
              if (!this.estaEnVentana(etapa, config)) {
                return crearPrediccionFueraVentana(
                  config.nombre,
                  config.id,
                  `Etapa ${etapa}: fuera de la ventana ${config.etapaMin}-${config.etapaMax}.`,
                  'ENFERMEDADES EN CEBADA.xlsx',
                  3,
                  dia.etapaHabilitante
                    ? 'operativo'
                    : 'operativo_provisional',
                  { etapaScore: 0 },
                  anterior,
                );
              }
              return this.predecirEnfermedad({
                config,
                semilla: siembra.semilla,
                etapa,
                clima: climaDia,
                prediccionAnterior: predAnterior,
                predecir,
              });
            });
      for (const enfermedad of enfermedades) {
        enfermedad.calidadDatos = combinarCalidadDatos(
          enfermedad.calidadDatos,
          dia.calidadClima,
        );
        if (!dia.etapaHabilitante) {
          enfermedad.modelo = {
            ...enfermedad.modelo,
            validacion: 'operativo_provisional',
          };
          enfermedad.calidadDatos = combinarCalidadDatos(
            enfermedad.calidadDatos,
            {
              nivel: 'baja',
              fuente: 'estimado',
              cobertura: dia.calidadClima.cobertura,
              fallback: true,
              resumen:
                'Screening ambiental calculado con etapa fenologica proyectada; no genera alertas automaticas.',
              limitaciones: dia.motivosNoHabilitante,
            },
          );
          if (etapa === undefined) {
            enfermedad.variables = {
              ...(enfermedad.variables || {}),
              etapaScore: 0,
            };
          }
        }
        enfermedad.calidadClima = dia.calidadClima;
      }

      if (!enfermedades.length) {
        continue;
      }
      const fuenteCampo =
        dia.serie.stageSource === 'campo' ||
        dia.serie.stageSource === 'proyeccion_anclada_campo';

      const prediccion: ICreatePrediccion = {
        idSiembra: siembra._id,
        idQuimica: siembra.idQuimica,
        idDistribuidor: siembra.idDistribuidor,
        idProductor: siembra.idProductor,
        idEstablecimiento: siembra.idEstablecimiento,
        fecha: fechaIso,
        fechaPrediccion: dia.fecha,
        etapa,
        nombreEtapa:
          etapa === undefined
            ? dia.serie.stage || 'Etapa no verificable'
            : this.getNombreEtapa(etapa),
        fuenteFenologia: fuenteCampo ? 'observada' : 'agrometeorologia',
        calidadFenologia: {
          nivel: dia.etapaHabilitante
            ? fuenteCampo
              ? 'alta'
              : 'media'
            : etapa !== undefined
              ? 'baja'
              : 'sin_datos',
          fuente: fuenteCampo ? 'manual' : 'estimado',
          cobertura: dia.etapaHabilitante ? 1 : etapa !== undefined ? 0.5 : 0,
          fallback: !dia.etapaHabilitante,
          resumen: dia.etapaHabilitante
            ? `Etapa provista por el motor agrometeorologico canonico (${dia.serie.stageSource}).`
            : etapa !== undefined
              ? 'Etapa proyectada apta para screening ambiental; requiere confirmacion a campo para alertas.'
              : 'La etapa canonica no habilita decisiones sanitarias.',
          limitaciones: dia.motivosNoHabilitante,
        },
        enfermedades,
        estacion: {
          idEstacion: dia.clima.estacion,
          fuente: dia.clima.fuente,
          distanciaMetros: dia.clima.distancia,
          humedadRelativa: climaDia.hr,
          precipitaciones: climaDia.precip,
          temperaturaMaxima: climaDia.tmax,
          temperaturaMinima: climaDia.tmin,
          temperaturaPromedio: climaDia.tavg,
        },
      };

      try {
        const prediccionCreada =
          await this.prediccionsRepository.create(prediccion);
        prediccionesCreadas.push(prediccionCreada);
        predAnterior = JSON.parse(JSON.stringify(prediccionCreada));
        ultimaCreada = predAnterior;
      } catch (error) {
        Logger.error(error);
        throw error;
      }
    }

    if (ultimaCreada) {
      await this.siembrasService.update(siembra._id, {
        ultimaPrediccion: ultimaCreada,
      });
    }

    return prediccionesCreadas;
  }

  private climaDiaCanonico(
    dia: IDiaSanitarioCanonico,
    anterior?: IDiaSanitarioCanonico,
  ): ClimaDiaCebada {
    return {
      hr: Number(dia.clima.humedad?.avg),
      tavg: Number(dia.clima.temperatura?.avg),
      tmin: Number(dia.clima.temperatura?.min),
      tmax: Number(dia.clima.temperatura?.max),
      precip: Number(dia.clima.lluvia?.sum),
      horas: [],
      horasMojado: Number(dia.serie.metrics?.leafWetnessHours),
      coberturaHoraria: dia.calidadClima.cobertura || 0,
      resolucion: 'proxy_diario',
      hrAnterior: Number(anterior?.clima.humedad?.avg),
      precipAnterior: Number(anterior?.clima.lluvia?.sum),
    };
  }

  private predecirEnfermedad(params: {
    config: ConfigEnfermedadCebada;
    semilla?: ISemilla;
    etapa: number;
    clima: ClimaDiaCebada;
    prediccionAnterior?: IPrediccion;
    predecir: boolean;
  }): IPrediccionEnfermedad {
    const { config, semilla, etapa, clima, prediccionAnterior, predecir } =
      params;
    if (!predecir) {
      return {
        enfermedad: config.nombre,
        idEnfermedad: config.id,
        resultado: 0,
        estado: 'calculado',
        modelo: {
          id: config.id,
          version: 3,
          fuente: 'ENFERMEDADES EN CEBADA.xlsx',
          resolucion: clima.resolucion,
        },
        variables: { formulaVersion: 3, etapaScore: 0 },
      };
    }
    const camposPorFormula: Record<
      ConfigEnfermedadCebada['formula'],
      string[]
    > = {
      mancha_red: ['hr', 'tavg'],
      escaldadura: ['tavg', 'horasMojado', 'precip'],
      roya_hoja: ['hr', 'tavg', 'precip'],
      fusariosis: [
        'hr',
        'hrAnterior',
        'tavg',
        'tmin',
        'tmax',
        'precip',
        'precipAnterior',
      ],
    };
    const faltantes = camposClimaticosFaltantes(
      clima as unknown as Record<string, unknown>,
      camposPorFormula[config.formula],
    );
    if (faltantes.length) {
      return crearPrediccionSinDatos(
        config.nombre,
        config.id,
        faltantes,
        'ENFERMEDADES EN CEBADA.xlsx',
      );
    }
    const anterior = prediccionAnterior?.enfermedades?.find(
      (e) => e.enfermedad === config.nombre,
    );
    const variablesAnterioresRaw =
      (anterior?.variables as IVariablesEnfermedadCebada) || {};
    const variablesAnteriores = [2, 3].includes(
      variablesAnterioresRaw.formulaVersion,
    )
      ? variablesAnterioresRaw
      : {};

    switch (config.formula) {
      case 'mancha_red':
        return this.predecirManchaEnRed(
          config,
          semilla,
          clima,
          variablesAnteriores,
        );
      case 'escaldadura':
        return this.predecirEscaldadura(config, semilla, etapa, clima);
      case 'roya_hoja':
        return this.predecirRoyaHoja(
          config,
          semilla,
          clima,
          variablesAnteriores,
        );
      case 'fusariosis':
        return this.predecirFusariosis(
          config,
          semilla,
          clima,
          variablesAnteriores,
        );
    }
  }

  private predecirManchaEnRed(
    config: ConfigEnfermedadCebada,
    semilla: ISemilla | undefined,
    clima: ClimaDiaCebada,
    anteriores: IVariablesEnfermedadCebada,
  ): IPrediccionEnfermedad {
    const resistencia = resolverResistencia(semilla?.resistencia, config.id);
    const fTemp = factorTemperaturaManchaRed(clima.tavg);
    const factorHumedad = factorHumedadManchaRed(clima.hr);
    const tasaDiaria =
      clima.resolucion === 'horaria'
        ? tasaDiariaManchaRedHoraria(clima.horas, resistencia.multiplicador)
        : fTemp * factorHumedad * resistencia.multiplicador;
    const previa = this.toNumber(
      anteriores.severidadAcumulada ?? anteriores.indiceAcumulado,
    );
    const severidadAcumulada = acumularSeveridadManchaRed(previa, tasaDiaria);
    const resultado = this.round(this.clamp(severidadAcumulada, 0, 100), 2);

    return {
      enfermedad: config.nombre,
      idEnfermedad: config.id,
      resultado,
      estado: 'calculado',
      ...metadataResistencia(resistencia),
      modelo: {
        id: config.id,
        version: 3,
        fuente: 'ENFERMEDADES EN CEBADA.xlsx / MANCHA EN RED',
        resolucion: clima.resolucion,
      },
      variables: {
        formulaVersion: 3,
        fTemp: this.round(fTemp, 3),
        factorHumedad: this.round(factorHumedad, 3),
        kVar: this.round(resistencia.multiplicador, 2),
        tasaDiaria: this.round(tasaDiaria, 3),
        severidadAcumulada: resultado,
        humedadScore: this.round(factorHumedad, 3),
        temperaturaScore: this.round(fTemp, 3),
        lluviaScore: this.round(this.clamp(clima.precip / 5, 0, 1), 3),
        etapaScore: 1,
      },
    };
  }

  private predecirEscaldadura(
    config: ConfigEnfermedadCebada,
    semilla: ISemilla | undefined,
    etapa: number,
    clima: ClimaDiaCebada,
  ): IPrediccionEnfermedad {
    const fTemp = this.factorTempEscaldadura(clima.tavg);
    const horasMojado = clima.horasMojado;
    const fHMF = this.factorHMF(horasMojado);
    const fPP = this.factorPPEscaldadura(clima.precip);
    const resistencia = resolverResistencia(semilla?.resistencia, config.id);
    const ri = fTemp * fHMF * fPP * resistencia.multiplicador;
    const resultado = this.round(
      calcularEscaldadura(
        clima.tavg,
        horasMojado,
        clima.precip,
        resistencia.multiplicador,
      ),
      2,
    );

    return {
      enfermedad: config.nombre,
      idEnfermedad: config.id,
      resultado,
      estado: 'calculado',
      ...metadataResistencia(resistencia),
      modelo: {
        id: config.id,
        version: 3,
        fuente: 'ENFERMEDADES EN CEBADA.xlsx / ESCALDADURA',
        resolucion: clima.resolucion,
      },
      variables: {
        formulaVersion: 3,
        fTemp: this.round(fTemp, 3),
        fHMF: this.round(fHMF, 3),
        fPP: this.round(fPP, 3),
        kVar: this.round(resistencia.multiplicador, 2),
        ri: this.round(ri, 3),
        horasMojado: this.round(horasMojado, 1),
        lluviaDiaria: this.round(clima.precip, 1),
        temperaturaScore: this.round(fTemp, 3),
        humedadScore: this.round(fHMF, 3),
        lluviaScore: this.round(fPP, 3),
        etapaScore: this.estaEnVentana(etapa, config) ? 1 : 0,
      },
    };
  }

  private predecirRoyaHoja(
    config: ConfigEnfermedadCebada,
    semilla: ISemilla | undefined,
    clima: ClimaDiaCebada,
    anteriores: IVariablesEnfermedadCebada,
  ): IPrediccionEnfermedad {
    const gdDia = gradosDiaRoya(clima.hr, clima.tavg);
    const dhrDia = clima.precip <= 0.2 && clima.hr >= 70 ? 1 : 0;
    const GD = this.round(this.toNumber(anteriores.GD) + gdDia, 2);
    const DHR = this.round(this.toNumber(anteriores.DHR) + dhrDia, 0);
    const resistencia = resolverResistencia(semilla?.resistencia, config.id);
    const resultado = this.round(
      calcularRoyaHoja(GD, DHR, resistencia.indiceResistencia),
      2,
    );

    return {
      enfermedad: config.nombre,
      idEnfermedad: config.id,
      resultado,
      estado: 'calculado',
      ...metadataResistencia(resistencia),
      modelo: {
        id: config.id,
        version: 3,
        fuente: 'ENFERMEDADES EN CEBADA.xlsx / Hoja1',
        resolucion: clima.resolucion,
      },
      variables: {
        formulaVersion: 3,
        GD,
        DHR,
        kVar: this.round(resistencia.multiplicador, 2),
        temperaturaScore: this.round(gdDia, 2),
        humedadScore: dhrDia,
        lluviaScore: clima.precip <= 0.2 ? 1 : 0,
        etapaScore: 1,
      },
    };
  }

  private predecirFusariosis(
    config: ConfigEnfermedadCebada,
    semilla: ISemilla | undefined,
    clima: ClimaDiaCebada,
    anteriores: IVariablesEnfermedadCebada,
  ): IPrediccionEnfermedad {
    const gdaAnterior = this.toNumber(anteriores.GDAcum);
    const GDAcum = this.round(gdaAnterior + clima.tavg, 2);
    const periodoMojado =
      clima.precipAnterior >= 0.2 &&
      clima.hrAnterior >= 81 &&
      clima.precip >= 0.2 &&
      clima.hr >= 78
        ? 1
        : 0;
    const PMoj = this.round(this.toNumber(anteriores.PMoj) + periodoMojado, 0);
    let residual = 0;
    if (clima.tmax > 26) residual += clima.tmax - 26;
    if (clima.tmin < 9) residual += 9 - clima.tmin;
    const GDN = this.round(this.toNumber(anteriores.GDN) + residual, 2);
    const resistencia = resolverResistencia(semilla?.resistencia, config.id);
    const activo = GDAcum < 530;
    const resultado = this.round(
      calcularFusariumEspiga(PMoj, GDN, resistencia.multiplicador, activo),
      2,
    );

    return {
      enfermedad: config.nombre,
      idEnfermedad: config.id,
      resultado,
      estado: activo ? 'calculado' : 'fuera_ventana',
      ...metadataResistencia(resistencia),
      modelo: {
        id: config.id,
        version: 3,
        fuente: 'ENFERMEDADES EN CEBADA.xlsx / modelo Fusarium',
        resolucion: clima.resolucion,
      },
      variables: {
        formulaVersion: 3,
        PMoj,
        GDN,
        GDAcum,
        kVar: this.round(resistencia.multiplicador, 2),
        humedadScore: periodoMojado,
        temperaturaScore: this.round(residual, 2),
        lluviaScore: clima.precip >= 0.2 ? 1 : 0,
        etapaScore: 1,
      },
    };
  }

  private estaEnVentana(
    etapa: number,
    config: ConfigEnfermedadCebada,
  ): boolean {
    return etapa >= config.etapaMin && etapa <= config.etapaMax;
  }

  private factorTempEscaldadura(temperatura: number): number {
    if (temperatura < 4 || temperatura > 25) return 0;
    if (temperatura >= 10 && temperatura <= 18) return 1;
    if (temperatura < 10) return this.clamp((temperatura - 4) / 6, 0, 1);
    return this.clamp((25 - temperatura) / 7, 0, 1);
  }

  private horasMojadoProxy(hr: number): number {
    if (hr >= 90) return 18;
    if (hr >= 85) return 12;
    return 0;
  }

  private factorHMF(horasMojado: number): number {
    if (horasMojado < 12) return 0;
    if (horasMojado >= 24) return 1;
    return this.clamp((horasMojado - 12) / 12, 0, 1);
  }

  private factorPPEscaldadura(lluvia: number): number {
    if (lluvia < 1) return 0.2;
    if (lluvia >= 5) return 1;
    return this.clamp(0.2 + ((lluvia - 1) / 4) * 0.8, 0.2, 1);
  }

  private async getUltimaPrediccion(
    idSiembra: string,
  ): Promise<IPrediccion | undefined> {
    const param: IQueryParam = {
      filter: JSON.stringify({ idSiembra }),
      sort: '-fecha',
      limit: 1,
    };
    const predicciones = await this.prediccionsRepository.get(param);
    return predicciones.datos[0];
  }

  private getNombreEtapa(etapa: number): string {
    const nombres = [
      'Siembra',
      'Emergencia',
      'Primer Nudo',
      'Hoja Bandera',
      'Espigazon',
      'Antesis',
      'Llenado de Granos',
      'Madurez Fisiologica',
    ];
    return nombres[etapa] || 'Ciclo completo';
  }

  private diaActual() {
    const fecha = new Date();
    fecha.setUTCHours(0, 0, 0, 0);
    return fecha;
  }

  private diaAnterior(fecha: Date) {
    const fechaAnterior = new Date(fecha);
    fechaAnterior.setUTCDate(fechaAnterior.getUTCDate() - 1);
    return fechaAnterior;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private round(value: number, digits = 2): number {
    if (!Number.isFinite(value)) return 0;
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  private toNumber(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }
}
