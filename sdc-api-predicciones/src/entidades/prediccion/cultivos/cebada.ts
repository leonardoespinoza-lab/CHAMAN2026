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
  tempOptima: number;
  tempTolerancia: number;
  humedadBase: number;
  lluviaCritica: number;
  pesoHumedad: number;
  pesoTemperatura: number;
  pesoLluvia: number;
  pesoEtapa: number;
  presionBase: number;
}

@Injectable()
export class PrediccionCebadaService {
  private readonly enfermedades: ConfigEnfermedadCebada[] = [
    {
      nombre: 'Mancha en Red',
      etapaMin: 1,
      etapaMax: 5,
      tempOptima: 17,
      tempTolerancia: 10,
      humedadBase: 82,
      lluviaCritica: 8,
      pesoHumedad: 0.35,
      pesoTemperatura: 0.25,
      pesoLluvia: 0.25,
      pesoEtapa: 0.15,
      presionBase: 2,
    },
    {
      nombre: 'Escaldadura de la Cebada',
      etapaMin: 1,
      etapaMax: 4,
      tempOptima: 13,
      tempTolerancia: 8,
      humedadBase: 85,
      lluviaCritica: 6,
      pesoHumedad: 0.4,
      pesoTemperatura: 0.25,
      pesoLluvia: 0.25,
      pesoEtapa: 0.1,
      presionBase: 1,
    },
    {
      nombre: 'Roya de la Hoja de Cebada',
      etapaMin: 2,
      etapaMax: 6,
      tempOptima: 18,
      tempTolerancia: 9,
      humedadBase: 70,
      lluviaCritica: 4,
      pesoHumedad: 0.3,
      pesoTemperatura: 0.35,
      pesoLluvia: 0.15,
      pesoEtapa: 0.2,
      presionBase: 1,
    },
    {
      nombre: 'Fusariosis de la Espiga de Cebada',
      etapaMin: 4,
      etapaMax: 6,
      tempOptima: 20,
      tempTolerancia: 9,
      humedadBase: 78,
      lluviaCritica: 5,
      pesoHumedad: 0.25,
      pesoTemperatura: 0.25,
      pesoLluvia: 0.35,
      pesoEtapa: 0.15,
      presionBase: 3,
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
              hr: HelperService.getHR(clima, fechaIso),
              tavg: HelperService.getTAvg(clima, fechaIso),
              precip: HelperService.getPrecip(clima, fechaIso),
              precipAnterior: HelperService.getPrecip(
                clima,
                this.diaAnterior(fecha).toISOString(),
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
      tavg: number;
      precip: number;
      precipAnterior: number;
    };
    prediccionAnterior?: IPrediccion;
    predecir: boolean;
  }): IPrediccionEnfermedad {
    const { config, semilla, etapa, clima, prediccionAnterior, predecir } =
      params;
    const anterior = prediccionAnterior?.enfermedades?.find(
      (e) => e.enfermedad === config.nombre,
    );
    const variablesAnteriores =
      (anterior?.variables as IVariablesEnfermedadCebada) || {};
    const etapaScore = this.estaEnVentana(etapa, config) ? 1 : 0;
    const humedadScore = this.clamp(
      (clima.hr - config.humedadBase) / (100 - config.humedadBase),
      0,
      1,
    );
    const temperaturaScore = this.clamp(
      1 - Math.abs(clima.tavg - config.tempOptima) / config.tempTolerancia,
      0,
      1,
    );
    const lluviaScore = this.clamp(
      (clima.precip + clima.precipAnterior * 0.5) / config.lluviaCritica,
      0,
      1,
    );
    const diaFavorable =
      etapaScore > 0 &&
      temperaturaScore >= 0.35 &&
      (humedadScore >= 0.55 || lluviaScore >= 0.45);

    const variables: IVariablesEnfermedadCebada = {
      diasFavorables: predecir
        ? (variablesAnteriores.diasFavorables || 0) + (diaFavorable ? 1 : 0)
        : 0,
      lluviaAcumulada: predecir
        ? this.round((variablesAnteriores.lluviaAcumulada || 0) * 0.7 + clima.precip, 1)
        : 0,
      humedadScore: this.round(humedadScore, 2),
      temperaturaScore: this.round(temperaturaScore, 2),
      lluviaScore: this.round(lluviaScore, 2),
      etapaScore,
    };

    const indiceDia =
      100 *
      (humedadScore * config.pesoHumedad +
        temperaturaScore * config.pesoTemperatura +
        lluviaScore * config.pesoLluvia +
        etapaScore * config.pesoEtapa);
    variables.indiceAcumulado = predecir
      ? this.round(
          this.clamp(
            (variablesAnteriores.indiceAcumulado || 0) * 0.62 +
              indiceDia * 0.38,
            0,
            100,
          ),
          1,
        )
      : 0;

    const resistencia =
      semilla?.resistencia?.find((r) => r.enfermedad === config.nombre)
        ?.multiplicador || 1;
    const resultado = predecir
      ? this.round(
          this.clamp(
            (variables.indiceAcumulado * 0.72 +
              (variables.diasFavorables || 0) * 2 +
              config.presionBase) *
              resistencia,
            0,
            100,
          ),
          2,
        )
      : 0;

    return {
      enfermedad: config.nombre,
      resultado,
      variables,
    };
  }

  private estaEnVentana(
    etapa: number,
    config: ConfigEnfermedadCebada,
  ): boolean {
    return etapa >= config.etapaMin && etapa <= config.etapaMax;
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
}
