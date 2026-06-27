import { Injectable, Logger } from '@nestjs/common';
import {
  ICreatePrediccion,
  ICrono,
  IEtapasTrigo,
  IPrediccion,
  IPrediccionEnfermedad,
  IQueryParam,
  ISiembra,
} from 'modelos/src';
import { HelperService } from '../../../auxiliares/helper';
import { CronosService } from '../../crono/service';
import { SiembrasService } from '../../siembra/service';
import { FusariumDeLaEspigaService } from '../enfermedades/fusarium_de_la_espiga';
import { ManchaAmarillaService } from '../enfermedades/mancha_amarilla';
import { ManchaDeLaHojaService } from '../enfermedades/mancha_de_la_hoja';
import { RoyaDeLaHojaService } from '../enfermedades/roya_de_la_hoja';
import { PrediccionsRepository } from '../repository';
import { ClimaService } from '../../clima/service';
import { FumigacionsService } from 'src/entidades/fumigacion/service';
import { RoyaAnaranjadaService } from '../enfermedades/roya_anaranjada';

@Injectable()
export class PrediccionTrigoService {
  constructor(
    private prediccionsRepository: PrediccionsRepository,
    private siembrasService: SiembrasService,
    private cronosService: CronosService,
    private climaService: ClimaService,
    private fumigacionsService: FumigacionsService,
    // Enfermedades
    private fusariumDeLaEspigaService: FusariumDeLaEspigaService,
    private manchaDeLaHojaService: ManchaDeLaHojaService,
    private manchaAmarillaService: ManchaAmarillaService,
    private royaDeLaHojaService: RoyaDeLaHojaService,
    private royaAnaranjadaService: RoyaAnaranjadaService,
  ) {}

  public async hacerPredicciones(siembra: ISiembra) {
    const prediccionesCreadas: IPrediccion[] = [];

    const res = await Promise.all([
      this.cronosService.get(siembra),
      this.getUltimaPrediccion(siembra._id),
    ]);

    const crono = res[0];
    let predAnterior = res[1];

    if (!crono) {
      Logger.warn(
        `Crono no encontrado para la siembra ${JSON.stringify(siembra)}`,
      );
      return;
    }

    // Fecha desde y hasta que se hara la prediccion
    const dateDesde = this.getFechaDesde(siembra, crono, predAnterior);
    const dateHasta = this.getFechaHasta(siembra, crono);

    // Fechas anteriores para traer datos de clima
    const dateAnteriorADesde1 = this.diaAnterior(dateDesde);
    const dateAnteriorADesde2 = this.diaAnterior(dateAnteriorADesde1);

    if (dateDesde && dateDesde < dateHasta) {
      Logger.log(
        `Creando predicciones desde ${dateDesde.getUTCDate()}/${
          dateDesde.getUTCMonth() + 1
        }/${dateDesde.getUTCFullYear()} hasta ${dateHasta.getUTCDate()}/${
          dateHasta.getUTCMonth() + 1
        }/${dateHasta.getUTCFullYear()}`,
      );
      const clima = await this.climaService.getEstacionMasCercanaEntreFechas(
        siembra.coordenadas.lat,
        siembra.coordenadas.lng,
        dateAnteriorADesde2.toISOString(),
        dateHasta.toISOString(),
      );
      if (!clima.length) {
        Logger.warn(
          `No hay una estacion con datos entre ${dateAnteriorADesde2.toISOString()} y ${dateHasta.toISOString()} cercana a la siembra ${JSON.stringify(
            siembra,
          )}`,
        );
        return;
      }

      const fumigaciones = await this.fumigacionsService.getByIdSiembra(
        siembra._id,
      );
      const fechasFumigadas = HelperService.fechasFumigadas(fumigaciones.datos);

      let ultimaPrediccion: IPrediccion;
      for (
        let fecha = dateDesde;
        fecha < dateHasta;
        fecha.setUTCDate(fecha.getUTCDate() + 1)
      ) {
        const predecir = !fechasFumigadas.includes(fecha.toISOString());
        if (!predecir) {
          Logger.log(
            `No se predice para la fecha ${fecha.toISOString()} porque fue fumigada`,
          );
        }

        const etapa = this.getEtapaPorFecha(siembra, crono, fecha);

        const distancia = clima[0].distancia;

        const hr = HelperService.getHR(clima, fecha.toISOString());
        const Tmin = HelperService.getTMin(clima, fecha.toISOString());
        const Tmax = HelperService.getTMax(clima, fecha.toISOString());
        const Tavg = HelperService.getTAvg(clima, fecha.toISOString());
        const precip = HelperService.getPrecip(clima, fecha.toISOString());
        const viento = HelperService.getViento(clima, fecha.toISOString());

        const fechaAnt = new Date(fecha);
        fechaAnt.setUTCDate(fechaAnt.getUTCDate() - 1);
        const hrAnterior = HelperService.getHR(clima, fechaAnt.toISOString());
        const precipAnterior = HelperService.getPrecip(
          clima,
          fechaAnt.toISOString(),
        );

        const prediccion: ICreatePrediccion = {
          idSiembra: siembra._id,
          idQuimica: siembra.idQuimica,
          idDistribuidor: siembra.idDistribuidor,
          idProductor: siembra.idProductor,
          idEstablecimiento: siembra.idEstablecimiento,
          fecha: fecha.toISOString(),
          fechaPrediccion: fecha.toISOString().split('T')[0],
          etapa,
          enfermedades: [],
          estacion: {
            idEstacion: clima[0].estacion,
            distanciaMetros: distancia,
            humedadRelativa: hr,
            precipitaciones: precip,
            temperaturaMaxima: Tmax,
            temperaturaMinima: Tmin,
            temperaturaPromedio: Tavg,
          },
        };

        // Hace las predicciones por enfermedad segun ventana fenologica.
        const predicciones: (IPrediccionEnfermedad | undefined)[] = [];

        if (this.estaEnVentanaManchas(etapa)) {
          predicciones.push(
            ...(await Promise.all([
              this.manchaDeLaHojaService.predecir(
                siembra.semilla,
                { precip, hr },
                predAnterior,
                predecir,
              ),
              this.manchaAmarillaService.predecir(
                siembra.semilla,
                { precip, hr, Tmin, Tmax },
                predAnterior,
                predecir,
              ),
            ])),
          );
        }

        if (this.estaEnVentanaRoyas(etapa)) {
          predicciones.push(
            ...(await Promise.all([
              this.royaDeLaHojaService.predecir(
                siembra.semilla,
                { precip, hr, Tavg },
                predAnterior,
                predecir,
              ),
              this.royaAnaranjadaService.predecir(
                siembra.semilla,
                { viento, hr, Tmin, Tmax },
                predecir,
              ),
            ])),
          );
        }

        if (this.estaEnVentanaFusarium(etapa)) {
          predicciones.push(
            await this.fusariumDeLaEspigaService.predecir(
              siembra.semilla,
              { precip, precipAnterior, hr, hrAnterior, Tmin, Tmax, Tavg },
              predAnterior,
              predecir,
            ),
          );
        }

        prediccion.enfermedades.push(
          ...predicciones.filter(
            (prediccion): prediccion is IPrediccionEnfermedad =>
              !!prediccion,
          ),
        );

        // Crea la prediccion en la base de datos
        if (prediccion.enfermedades.length) {
          try {
            const prediccionCreada =
              await this.prediccionsRepository.create(prediccion);
            prediccionesCreadas.push(prediccionCreada);
            predAnterior = JSON.parse(JSON.stringify(prediccionCreada));
            ultimaPrediccion = predAnterior;
          } catch (error) {
            Logger.error(error);
          }
        }
      }

      // Actualiza la siembra con la ultima prediccion
      if (ultimaPrediccion) {
        await this.siembrasService.update(siembra._id, { ultimaPrediccion });
      }
    }
    return prediccionesCreadas;
  }

  private estaEnVentanaManchas(etapa: number): boolean {
    return etapa >= 1 && etapa <= 4;
  }

  private estaEnVentanaRoyas(etapa: number): boolean {
    return etapa >= 2 && etapa <= 6;
  }

  private estaEnVentanaFusarium(etapa: number): boolean {
    return etapa >= 4 && etapa <= 6;
  }

  private async getUltimaPrediccion(
    idSiembra: string,
  ): Promise<IPrediccion | undefined> {
    const filter = {
      idSiembra,
    };
    const param: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: '-fecha',
      limit: 1,
    };
    const predicciones = await this.prediccionsRepository.get(param);
    return predicciones.datos[0];
  }

  // Helpers

  /**
   *
   * @returns Etapa en la que esta la siembra en la fecha dada
   */
  private getEtapaPorFecha(siembra: ISiembra, crono: ICrono, fecha: Date) {
    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaActual = fecha;
    const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
    const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    const etapasTrigo = crono.etapas as IEtapasTrigo;

    const etapa1 = etapasTrigo.R0_R1;
    const etapa2 = etapa1 + etapasTrigo.R1_R2;
    const etapa3 = etapa2 + etapasTrigo.R2_R3;
    const etapa4 = etapa3 + etapasTrigo.R3_R4;
    const etapa5 = etapa4 + etapasTrigo.R4_R5;
    const etapa6 = etapa5 + etapasTrigo.R5_R6;
    const etapa7 = etapa6 + etapasTrigo.R6_R7;

    if (diasTransucurridos < etapa1) {
      return 0;
    } else if (diasTransucurridos < etapa2) {
      return 1;
    } else if (diasTransucurridos < etapa3) {
      return 2;
    } else if (diasTransucurridos < etapa4) {
      return 3;
    } else if (diasTransucurridos < etapa5) {
      return 4;
    } else if (diasTransucurridos < etapa6) {
      return 5;
    } else if (diasTransucurridos < etapa7) {
      return 6;
    } else {
      return 7;
    }
  }

  /**
   *
   * @returns Fecha en que inicia la etapa dada
   */
  private getFechaInicioEtapa(
    siembra: ISiembra,
    crono: ICrono,
    etapa: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  ) {
    const etapas = [];
    const etapasTrigo = crono.etapas as IEtapasTrigo;

    etapas[0] = 0;
    etapas[1] = etapasTrigo.R0_R1;
    etapas[2] = etapas[1] + etapasTrigo.R1_R2;
    etapas[3] = etapas[2] + etapasTrigo.R2_R3;
    etapas[4] = etapas[3] + etapasTrigo.R3_R4;
    etapas[5] = etapas[4] + etapasTrigo.R4_R5;
    etapas[6] = etapas[5] + etapasTrigo.R5_R6;
    etapas[7] = etapas[6] + etapasTrigo.R6_R7;

    const fecha = new Date(siembra.fechaSiembra);
    fecha.setUTCHours(0, 0, 0, 0);

    const dias = etapas[etapa];
    fecha.setUTCDate(fecha.getUTCDate() + dias);

    return fecha;
  }

  /**
   *
   * @returns Fecha desde que se debe hacer la prediccion,
   * en caso de que exista una prediccion anterior se devuelve
   * la fecha de la prediccion anterior,
   * sino desde emergencia para no perder el seguimiento foliar temprano.
   */
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

  /**
   *
   * @returns Fecha hasta que se debe hacer la prediccion,
   * la fecha menor entre la fecha actual y la fecha en que inicia la etapa 7.
   */
  private getFechaHasta(siembra: ISiembra, crono: ICrono) {
    const fechaLimite = this.getFechaInicioEtapa(siembra, crono, 7);
    const fechaHoy = this.diaActual();
    const fechaMenor = fechaHoy > fechaLimite ? fechaLimite : fechaHoy;
    fechaMenor.setUTCHours(3, 0, 0, 0);
    return fechaMenor;
  }

  /**
   *
   * @returns Fecha actual a las 0:00:00 UTC
   */
  private diaActual() {
    const fecha = new Date();
    fecha.setUTCHours(0, 0, 0, 0);
    return fecha;
  }

  private diaAnterior(fecha: Date) {
    const fechaAnterior = new Date(fecha);
    fechaAnterior.setDate(fechaAnterior.getDate() - 1);
    return fechaAnterior;
  }
}
