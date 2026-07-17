import { Injectable, Logger } from '@nestjs/common';
import {
  ICreatePrediccion,
  ICrono,
  IEtapasMaiz,
  IPrediccion,
  IQueryParam,
  ISiembra,
} from 'modelos/src';
import { HelperService } from '../../../auxiliares/helper';
import { CronosService } from '../../crono/service';
import { SiembrasService } from '../../siembra/service';
import { PrediccionsRepository } from '../repository';
import { ClimaService } from '../../clima/service';
import { FumigacionsService } from 'src/entidades/fumigacion/service';
import { RoyaDelMaizService } from '../enfermedades/roya_del_maiz';
import {
  aplicarEtapaFenologicaObservada,
  calidadFenologiaManual,
  resolverEtapaFenologicaObservada,
} from '../fenologia-observada';

@Injectable()
export class PrediccionMaizService {
  constructor(
    private prediccionsRepository: PrediccionsRepository,
    private siembrasService: SiembrasService,
    private cronosService: CronosService,
    private climaService: ClimaService,
    private fumigacionsService: FumigacionsService,
    // Enfermedades
    private royaDelMaizService: RoyaDelMaizService,
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
        undefined,
        siembra.establecimiento,
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

        const etapaCrono = this.getEtapaCronoPorFecha(siembra, crono, fecha);
        const fenologiaObservada = resolverEtapaFenologicaObservada(
          siembra,
          fecha,
          'Maiz',
          this.getCronologiaFenologica(crono),
        );
        const etapa = aplicarEtapaFenologicaObservada(
          etapaCrono,
          fenologiaObservada,
        );
        const calidadFenologiaObservada = fenologiaObservada
          ? calidadFenologiaManual(fenologiaObservada)
          : undefined;

        const distancia = clima[0].distancia;

        const hr = HelperService.getHR(clima, fecha.toISOString());
        const Tmin = HelperService.getTMin(clima, fecha.toISOString());
        const Tmax = HelperService.getTMax(clima, fecha.toISOString());
        const Tavg = HelperService.getTAvg(clima, fecha.toISOString());
        const precip = HelperService.getPrecip(clima, fecha.toISOString());

        const prediccion: ICreatePrediccion = {
          idSiembra: siembra._id,
          idQuimica: siembra.idQuimica,
          idDistribuidor: siembra.idDistribuidor,
          idProductor: siembra.idProductor,
          idEstablecimiento: siembra.idEstablecimiento,
          fecha: fecha.toISOString(),
          fechaPrediccion: fecha.toISOString().split('T')[0],
          etapa,
          nombreEtapa: this.nombreEtapa(etapa),
          fuenteFenologia: fenologiaObservada ? 'observada' : 'crono',
          registroFenologicoId: fenologiaObservada?.registro.id,
          calidadFenologia: calidadFenologiaObservada || {
            nivel: 'media',
            fuente: 'estimado',
            cobertura: 1,
            fallback: true,
            resumen: 'Etapa estimada desde fecha de siembra y crono.',
            limitaciones: [
              'No hay observación fenológica de campo decisoria anterior a la fecha.',
            ],
          },
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

        if (this.estaEnVentanaRoyaDelMaiz(etapa)) {
          const pred = await this.royaDelMaizService.predecir(
            siembra.semilla,
            { precip, hr, Tavg },
            predAnterior,
            predecir,
          );
          prediccion.enfermedades.push(pred);
        }

        // Crea la prediccion en la base de datos
        if (prediccion.enfermedades.length) {
          try {
            const prediccionCreada = await this.prediccionsRepository.create(
              prediccion,
            );
            prediccionesCreadas.push(prediccionCreada);
            predAnterior = JSON.parse(JSON.stringify(prediccionCreada));
            ultimaPrediccion = predAnterior;
          } catch (error) {
            Logger.error(error);
            throw error;
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

  private estaEnVentanaRoyaDelMaiz(etapa: number): boolean {
    return etapa === 1 || etapa === 2;
  }

  private nombreEtapa(etapa: number): string {
    switch (etapa) {
      case 0:
        return 'Siembra';
      case 1:
        return 'Vegetativo';
      case 2:
        return 'Reproductivo';
      default:
        return 'Madurez';
    }
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
    const etapaCrono = this.getEtapaCronoPorFecha(siembra, crono, fecha);
    return aplicarEtapaFenologicaObservada(
      etapaCrono,
      resolverEtapaFenologicaObservada(
        siembra,
        fecha,
        'Maiz',
        this.getCronologiaFenologica(crono),
      ),
    );
  }

  private getEtapaCronoPorFecha(siembra: ISiembra, crono: ICrono, fecha: Date) {
    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaActual = fecha;
    const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
    const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    const etapas = crono.etapas as IEtapasMaiz;

    const etapa1 = etapas.siembra_emergencia;
    const etapa2 = etapa1 + etapas.emergencia_floracion;
    const etapa3 = etapa2 + etapas.floracion_madurez;

    if (diasTransucurridos < etapa1) {
      return 0;
    } else if (diasTransucurridos < etapa2) {
      return 1;
    } else if (diasTransucurridos < etapa3) {
      return 2;
    } else {
      return 3;
    }
  }

  private getCronologiaFenologica(crono: ICrono) {
    const etapas = crono.etapas as IEtapasMaiz;
    return [
      {
        etapa: 0,
        duracionDias: Number(etapas.siembra_emergencia) || 0,
      },
      {
        etapa: 1,
        duracionDias: Number(etapas.emergencia_floracion) || 0,
      },
      {
        etapa: 2,
        duracionDias: Number(etapas.floracion_madurez) || 0,
      },
      { etapa: 3 },
    ];
  }

  /**
   *
   * @returns Fecha en que inicia la etapa dada
   */
  private getFechaInicioEtapa(
    siembra: ISiembra,
    crono: ICrono,
    etapa: 1 | 2 | 3,
  ) {
    const etapas = [];
    const etapasMaiz = crono.etapas as IEtapasMaiz;

    etapas[0] = 0;
    etapas[1] = etapasMaiz.siembra_emergencia;
    etapas[2] = etapas[1] + etapasMaiz.emergencia_floracion;
    etapas[3] = etapas[2] + etapasMaiz.floracion_madurez;

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
   * sino desde emergencia para seguir el cultivo activo.
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
   * la fecha menor entre la fecha actual y madurez.
   */
  private getFechaHasta(siembra: ISiembra, crono: ICrono) {
    const fechaLimite = this.getFechaInicioEtapa(siembra, crono, 3);
    fechaLimite.setUTCHours(3, 0, 0, 0);

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
