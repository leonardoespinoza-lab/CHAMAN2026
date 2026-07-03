import { Injectable, Logger } from '@nestjs/common';
import {
  ICreatePrediccion,
  ICrono,
  IEtapasCebada,
  IPrediccion,
  IPrediccionEnfermedad,
  IQueryParam,
  ISemilla,
  ISiembra,
  IVariablesEnfermedadCebada,
  TEnfermedad,
} from 'modelos/src';
import { HelperService } from '../../../auxiliares/helper';
import { CronosService } from '../../crono/service';
import { SiembrasService } from '../../siembra/service';
import { ClimaService } from '../../clima/service';
import { FumigacionsService } from 'src/entidades/fumigacion/service';
import { PrediccionsRepository } from '../repository';

type EnfermedadCebada = Extract<
  TEnfermedad,
  | 'Mancha en Red'
  | 'Escaldadura de la Cebada'
  | 'Roya de la Hoja de Cebada'
  | 'Fusariosis de la Espiga de Cebada'
>;

interface ConfigEnfermedadCebada {
  nombre: EnfermedadCebada;
  etapaMin: number;
  etapaMax: number;
  formula: 'mancha_red' | 'escaldadura' | 'roya_hoja' | 'fusariosis';
}

@Injectable()
export class PrediccionCebadaService {
  private readonly enfermedades: ConfigEnfermedadCebada[] = [
    {
      nombre: 'Mancha en Red',
      etapaMin: 1,
      etapaMax: 5,
      formula: 'mancha_red',
    },
    {
      nombre: 'Escaldadura de la Cebada',
      etapaMin: 1,
      etapaMax: 4,
      formula: 'escaldadura',
    },
    {
      nombre: 'Roya de la Hoja de Cebada',
      etapaMin: 2,
      etapaMax: 6,
      formula: 'roya_hoja',
    },
    {
      nombre: 'Fusariosis de la Espiga de Cebada',
      etapaMin: 4,
      etapaMax: 6,
      formula: 'fusariosis',
    },
  ];

  constructor(
    private prediccionsRepository: PrediccionsRepository,
    private siembrasService: SiembrasService,
    private cronosService: CronosService,
    private climaService: ClimaService,
    private fumigacionsService: FumigacionsService,
  ) {}

  public async hacerPredicciones(siembra: ISiembra) {
    const prediccionesCreadas: IPrediccion[] = [];
    const [crono, ultimaPrediccion] = await Promise.all([
      this.cronosService.get(siembra),
      this.getUltimaPrediccion(siembra._id),
    ]);

    let predAnterior = ultimaPrediccion;

    if (!crono) {
      Logger.warn(
        `Crono de Cebada no encontrado para la siembra ${JSON.stringify(
          siembra,
        )}`,
      );
      return prediccionesCreadas;
    }

    const dateDesde = this.getFechaDesde(siembra, crono, predAnterior);
    const dateHasta = this.getFechaHasta(siembra, crono);
    const dateAnteriorADesde = this.diaAnterior(dateDesde);

    if (!dateDesde || dateDesde >= dateHasta) {
      return prediccionesCreadas;
    }

    Logger.log(
      `Creando predicciones Cebada desde ${dateDesde.toISOString()} hasta ${dateHasta.toISOString()}`,
    );

    const clima = await this.climaService.getEstacionMasCercanaEntreFechas(
      siembra.coordenadas.lat,
      siembra.coordenadas.lng,
      dateAnteriorADesde.toISOString(),
      dateHasta.toISOString(),
    );

    if (!clima.length) {
      Logger.warn(
        `No hay estacion con datos para Cebada entre ${dateAnteriorADesde.toISOString()} y ${dateHasta.toISOString()}`,
      );
      return prediccionesCreadas;
    }

    const fumigaciones = await this.fumigacionsService.getByIdSiembra(
      siembra._id,
    );
    const fechasFumigadas = HelperService.fechasFumigadas(fumigaciones.datos);
    let ultimaCreada: IPrediccion | undefined;

    for (
      let fecha = new Date(dateDesde);
      fecha < dateHasta;
      fecha.setUTCDate(fecha.getUTCDate() + 1)
    ) {
      const fechaIso = fecha.toISOString();
      const fechaAnteriorIso = this.diaAnterior(fecha).toISOString();
      const predecir = !fechasFumigadas.includes(fechaIso);
      const etapa = this.getEtapaPorFecha(siembra, crono, fecha);
      const enfermedades = this.enfermedades
        .filter((config) => this.estaEnVentana(etapa, config))
        .map((config) =>
          this.predecirEnfermedad({
            config,
            semilla: siembra.semilla,
            etapa,
            clima: {
              hr: this.toNumber(HelperService.getHR(clima, fechaIso)),
              hrAnterior: this.toNumber(
                HelperService.getHR(clima, fechaAnteriorIso),
              ),
              tavg: this.toNumber(HelperService.getTAvg(clima, fechaIso)),
              tmin: this.toNumber(HelperService.getTMin(clima, fechaIso)),
              tmax: this.toNumber(HelperService.getTMax(clima, fechaIso)),
              precip: this.toNumber(HelperService.getPrecip(clima, fechaIso)),
              precipAnterior: this.toNumber(
                HelperService.getPrecip(clima, fechaAnteriorIso),
              ),
            },
            prediccionAnterior: predAnterior,
            predecir,
          }),
        );

      if (!enfermedades.length) {
        continue;
      }

      const prediccion: ICreatePrediccion = {
        idSiembra: siembra._id,
        idQuimica: siembra.idQuimica,
        idDistribuidor: siembra.idDistribuidor,
        idProductor: siembra.idProductor,
        idEstablecimiento: siembra.idEstablecimiento,
        fecha: fechaIso,
        fechaPrediccion: fechaIso.split('T')[0],
        etapa,
        nombreEtapa: this.getNombreEtapa(etapa),
        enfermedades,
        estacion: {
          idEstacion: clima[0].estacion,
          distanciaMetros: clima[0].distancia,
          humedadRelativa: HelperService.getHR(clima, fechaIso),
          precipitaciones: HelperService.getPrecip(clima, fechaIso),
          temperaturaMaxima: HelperService.getTMax(clima, fechaIso),
          temperaturaMinima: HelperService.getTMin(clima, fechaIso),
          temperaturaPromedio: HelperService.getTAvg(clima, fechaIso),
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
      }
    }

    if (ultimaCreada) {
      await this.siembrasService.update(siembra._id, {
        ultimaPrediccion: ultimaCreada,
      });
    }

    return prediccionesCreadas;
  }

  private predecirEnfermedad(params: {
    config: ConfigEnfermedadCebada;
    semilla?: ISemilla;
    etapa: number;
    clima: {
      hr: number;
      hrAnterior: number;
      tavg: number;
      tmin: number;
      tmax: number;
      precip: number;
      precipAnterior: number;
    };
    prediccionAnterior?: IPrediccion;
    predecir: boolean;
  }): IPrediccionEnfermedad {
    const { config, semilla, etapa, clima, prediccionAnterior, predecir } =
      params;
    if (!predecir) {
      return {
        enfermedad: config.nombre,
        resultado: 0,
        variables: { formulaVersion: 2, etapaScore: 0 },
      };
    }
    const anterior = prediccionAnterior?.enfermedades?.find(
      (e) => e.enfermedad === config.nombre,
    );
    const variablesAnterioresRaw =
      (anterior?.variables as IVariablesEnfermedadCebada) || {};
    const variablesAnteriores =
      variablesAnterioresRaw.formulaVersion === 2
        ? variablesAnterioresRaw
        : {};

    switch (config.formula) {
      case 'mancha_red':
        return this.predecirManchaEnRed(config, semilla, clima, variablesAnteriores);
      case 'escaldadura':
        return this.predecirEscaldadura(config, semilla, etapa, clima);
      case 'roya_hoja':
        return this.predecirRoyaHoja(config, semilla, clima, variablesAnteriores);
      case 'fusariosis':
        return this.predecirFusariosis(config, semilla, clima, variablesAnteriores);
    }
  }

  private predecirManchaEnRed(
    config: ConfigEnfermedadCebada,
    semilla: ISemilla | undefined,
    clima: {
      hr: number;
      tavg: number;
      precip: number;
    },
    anteriores: IVariablesEnfermedadCebada,
  ): IPrediccionEnfermedad {
    const fTemp = this.factorTempManchaRed(clima.tavg);
    const factorHumedad = this.factorHumedadManchaRed(clima.hr);
    const kVar = this.getKVar(semilla, config.nombre, 1);
    const tasaDiaria = fTemp * factorHumedad * kVar;
    const previa = this.toNumber(
      anteriores.severidadAcumulada ?? anteriores.indiceAcumulado,
    );
    const severidadAcumulada =
      tasaDiaria > 0
        ? previa <= 0
          ? tasaDiaria > 0.2
            ? 0.1
            : 0
          : previa + tasaDiaria * previa * (1 - previa / 100)
        : previa;
    const resultado = this.round(this.clamp(severidadAcumulada, 0, 100), 2);

    return {
      enfermedad: config.nombre,
      resultado,
      variables: {
        formulaVersion: 2,
        fTemp: this.round(fTemp, 3),
        factorHumedad: this.round(factorHumedad, 3),
        kVar: this.round(kVar, 2),
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
    clima: {
      hr: number;
      tavg: number;
      precip: number;
    },
  ): IPrediccionEnfermedad {
    const fTemp = this.factorTempEscaldadura(clima.tavg);
    const horasMojado = this.horasMojadoProxy(clima.hr);
    const fHMF = this.factorHMF(horasMojado);
    const fPP = this.factorPPEscaldadura(clima.precip);
    const kVar = this.getKVar(semilla, config.nombre, 1);
    const ri = fTemp * fHMF * fPP * kVar;
    const resultado = this.round(this.clamp(ri * 100, 0, 100), 2);

    return {
      enfermedad: config.nombre,
      resultado,
      variables: {
        formulaVersion: 2,
        fTemp: this.round(fTemp, 3),
        fHMF: this.round(fHMF, 3),
        fPP: this.round(fPP, 3),
        kVar: this.round(kVar, 2),
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
    clima: {
      hr: number;
      tavg: number;
      precip: number;
    },
    anteriores: IVariablesEnfermedadCebada,
  ): IPrediccionEnfermedad {
    const gdDia = this.gradosDiaRoya(clima.hr, clima.tavg);
    const dhrDia = clima.precip <= 0.2 && clima.hr >= 70 ? 1 : 0;
    const GD = this.round(this.toNumber(anteriores.GD) + gdDia, 2);
    const DHR = this.round(this.toNumber(anteriores.DHR) + dhrDia, 0);
    const IR = this.indiceResistencia(semilla, config.nombre);
    const resultado = this.round(
      this.clamp(4.42 + 0.61 * GD + 0.57 * DHR - 30.01 * IR, 0, 100),
      2,
    );

    return {
      enfermedad: config.nombre,
      resultado,
      variables: {
        formulaVersion: 2,
        GD,
        DHR,
        kVar: this.round(this.getKVar(semilla, config.nombre, 1), 2),
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
    clima: {
      hr: number;
      hrAnterior: number;
      tavg: number;
      tmin: number;
      tmax: number;
      precip: number;
      precipAnterior: number;
    },
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
    const kVar = this.getKVar(semilla, config.nombre, 1);
    const activo = GDAcum < 530;
    const resultado = activo
      ? this.round(
          this.clamp((20.37 + 8.63 * PMoj - 0.49 * GDN) * kVar, 0, 100),
          2,
        )
      : 0;

    return {
      enfermedad: config.nombre,
      resultado,
      variables: {
        formulaVersion: 2,
        PMoj,
        GDN,
        GDAcum,
        kVar: this.round(kVar, 2),
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

  private factorTempManchaRed(temperatura: number): number {
    if (temperatura < 5 || temperatura > 30) return 0;
    return this.round(((temperatura - 5) * (30 - temperatura)) / 150, 4);
  }

  private factorHumedadManchaRed(hr: number): number {
    if (hr >= 90) return 1;
    if (hr >= 80) return 0.5;
    return 0;
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

  private gradosDiaRoya(hr: number, tavg: number): number {
    if (hr < 49 || tavg < 12) return 0;
    const baseTermica = tavg >= 18 ? 18 : tavg;
    return this.round(Math.max(baseTermica - 12, 0), 2);
  }

  private getKVar(
    semilla: ISemilla | undefined,
    enfermedad: EnfermedadCebada,
    fallback: number,
  ): number {
    const value = semilla?.resistencia?.find((r) => r.enfermedad === enfermedad)
      ?.multiplicador;
    const numeric = this.toNumber(value, fallback);
    return this.clamp(numeric, 0.05, 1.4);
  }

  private indiceResistencia(
    semilla: ISemilla | undefined,
    enfermedad: EnfermedadCebada,
  ): number {
    const value = semilla?.resistencia?.find((r) => r.enfermedad === enfermedad)
      ?.multiplicador;
    if (value === undefined || value === null) return 0;
    const numeric = this.toNumber(value, 0);
    if (numeric <= 0.35) return 1;
    if (numeric <= 0.75) return 0.65;
    if (numeric <= 1.05) return 0.35;
    return 0;
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

  private getEtapaPorFecha(siembra: ISiembra, crono: ICrono, fecha: Date) {
    const fechaSiembra = new Date(siembra.fechaSiembra);
    const diferencia = fecha.getTime() - fechaSiembra.getTime();
    const diasTranscurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));
    const acumuladas = this.getEtapasAcumuladas(crono);

    if (diasTranscurridos < acumuladas[1]) return 0;
    if (diasTranscurridos < acumuladas[2]) return 1;
    if (diasTranscurridos < acumuladas[3]) return 2;
    if (diasTranscurridos < acumuladas[4]) return 3;
    if (diasTranscurridos < acumuladas[5]) return 4;
    if (diasTranscurridos < acumuladas[6]) return 5;
    if (diasTranscurridos < acumuladas[7]) return 6;
    return 7;
  }

  private getFechaInicioEtapa(
    siembra: ISiembra,
    crono: ICrono,
    etapa: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  ) {
    const acumuladas = this.getEtapasAcumuladas(crono);
    const fecha = new Date(siembra.fechaSiembra);
    fecha.setUTCHours(0, 0, 0, 0);
    fecha.setUTCDate(fecha.getUTCDate() + acumuladas[etapa]);
    return fecha;
  }

  private getEtapasAcumuladas(crono: ICrono): number[] {
    const etapas = crono.etapas as IEtapasCebada;
    const acumuladas = [0];
    acumuladas[1] = etapas.siembra_emergencia || 0;
    acumuladas[2] =
      acumuladas[1] + (etapas.emergencia_primer_nudo || 0);
    acumuladas[3] =
      acumuladas[2] + (etapas.primer_nudo_hoja_bandera || 0);
    acumuladas[4] =
      acumuladas[3] + (etapas.hoja_bandera_espigazon || 0);
    acumuladas[5] = acumuladas[4] + (etapas.espigazon_antesis || 0);
    acumuladas[6] =
      acumuladas[5] + (etapas.antesis_llenado_granos || 0);
    acumuladas[7] =
      acumuladas[6] + (etapas.llenado_granos_madurez_fisiologica || 0);
    return acumuladas;
  }

  private getFechaDesde(
    siembra: ISiembra,
    crono: ICrono,
    prediccionAnterior?: IPrediccion,
  ) {
    if (prediccionAnterior) {
      const fecha = new Date(prediccionAnterior.fecha);
      fecha.setUTCHours(3, 0, 0, 0);
      fecha.setUTCDate(fecha.getUTCDate() + 1);
      return fecha;
    }

    const fecha = this.getFechaInicioEtapa(siembra, crono, 1);
    fecha.setUTCHours(3, 0, 0, 0);
    return fecha;
  }

  private getFechaHasta(siembra: ISiembra, crono: ICrono) {
    const fechaLimite = this.getFechaInicioEtapa(siembra, crono, 7);
    const fechaHoy = this.diaActual();
    const fechaMenor = fechaHoy > fechaLimite ? fechaLimite : fechaHoy;
    fechaMenor.setUTCHours(3, 0, 0, 0);
    return fechaMenor;
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
