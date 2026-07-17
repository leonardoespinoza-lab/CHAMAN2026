import { Injectable, Logger } from '@nestjs/common';
import {
  ICreatePrediccion,
  ICrono,
  IEtapasSoja,
  IPrediccion,
  IPrediccionEnfermedad,
  IQueryParam,
  ISiembra,
} from 'modelos/src';
import { HelperService } from '../../../auxiliares/helper';
import { CronosService } from '../../crono/service';
import { SiembrasService } from '../../siembra/service';
import { FinCicloSojaService } from '../enfermedades/fin_ciclo_soja';
import {
  aplicarEtapaFenologicaObservada,
  calidadFenologiaManual,
  resolverEtapaFenologicaObservada,
} from '../fenologia-observada';
import { PrediccionsRepository } from '../repository';
import { ClimaService } from '../../clima/service';
import { FumigacionsService } from 'src/entidades/fumigacion/service';

@Injectable()
export class PrediccionSojaService {
  constructor(
    private prediccionsRepository: PrediccionsRepository,
    private siembrasService: SiembrasService,
    private cronosService: CronosService,
    private climaService: ClimaService,
    private fumigacionsService: FumigacionsService,
    // Enfermedades
    private finCicloSojaService: FinCicloSojaService,
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
    const dateDesde = this.getFechaDesde(siembra, crono, predAnterior, 'R3');
    const dateHasta = this.getFechaHasta(siembra, crono, 'R7');

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

      // Logger.log(`Fechas fumigadas: ${JSON.stringify(fechasFumigadas)}`);

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
          'Soja',
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
          nombreEtapa: etapa,
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
            idEstacion: clima[0]?.estacion,
            distanciaMetros: distancia,
            humedadRelativa: hr,
            precipitaciones: precip,
            temperaturaMaxima: Tmax,
            temperaturaMinima: Tmin,
            temperaturaPromedio: Tavg,
          },
        };

        // Enfermedades de fin de ciclo: ventana reproductiva R3-R7.
        const predicciones: IPrediccionEnfermedad[] = [];
        if (this.estaEnVentanaFinDeCiclo(etapa)) {
          predicciones.push(
            ...(await Promise.all([
              this.finCicloSojaService.predecir(
                siembra.semilla,
                { precip },
                predAnterior,
                predecir,
              ),
            ])),
          );
        }
        prediccion.enfermedades.push(...predicciones);

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

  private estaEnVentanaFinDeCiclo(
    etapa: 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7',
  ): boolean {
    return etapa === 'R3' || etapa === 'R5';
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
  private getEtapaPorFecha(
    siembra: ISiembra,
    crono: ICrono,
    fecha: Date,
  ): 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7' {
    const etapaCrono = this.getEtapaCronoPorFecha(siembra, crono, fecha);
    return aplicarEtapaFenologicaObservada(
      etapaCrono,
      resolverEtapaFenologicaObservada(
        siembra,
        fecha,
        'Soja',
        this.getCronologiaFenologica(crono),
      ),
    );
  }

  private getEtapaCronoPorFecha(
    siembra: ISiembra,
    crono: ICrono,
    fecha: Date,
  ): 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7' {
    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaActual = fecha;
    const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
    const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    const etapasSoja = crono.etapas as IEtapasSoja;

    const etapa1 = etapasSoja.siembra_emergencia;
    const etapa2 = etapa1 + etapasSoja.emergencia_R1;
    const etapa3 = etapa2 + etapasSoja.R1_R3;
    const etapa4 = etapa3 + etapasSoja.R3_R5;
    const etapa5 = etapa4 + etapasSoja.R5_R7;

    if (diasTransucurridos < etapa1) {
      return 'Siembra';
    } else if (diasTransucurridos < etapa2) {
      return 'Emergencia';
    } else if (diasTransucurridos < etapa3) {
      return 'R1';
    } else if (diasTransucurridos < etapa4) {
      return 'R3';
    } else if (diasTransucurridos < etapa5) {
      return 'R5';
    } else {
      return 'R7';
    }
  }

  private getCronologiaFenologica(crono: ICrono) {
    const etapas = crono.etapas as IEtapasSoja;
    return [
      {
        etapa: 'Siembra' as const,
        duracionDias: Number(etapas.siembra_emergencia) || 0,
      },
      {
        etapa: 'Emergencia' as const,
        duracionDias: Number(etapas.emergencia_R1) || 0,
      },
      {
        etapa: 'R1' as const,
        duracionDias: Number(etapas.R1_R3) || 0,
      },
      {
        etapa: 'R3' as const,
        duracionDias: Number(etapas.R3_R5) || 0,
      },
      {
        etapa: 'R5' as const,
        duracionDias: Number(etapas.R5_R7) || 0,
      },
      { etapa: 'R7' as const },
    ];
  }

  /**
   *
   * @returns Fecha en que inicia la etapa dada
   */
  private getFechaInicioEtapa(
    siembra: ISiembra,
    crono: ICrono,
    etapa: 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7',
  ) {
    const etapas = [];
    const etapasSoja = crono.etapas as IEtapasSoja;

    etapas['Siembra'] = 0;
    etapas['Emergencia'] = etapasSoja.siembra_emergencia;
    etapas['R1'] = etapas['Emergencia'] + etapasSoja.emergencia_R1;
    etapas['R3'] = etapas['R1'] + etapasSoja.R1_R3;
    etapas['R5'] = etapas['R3'] + etapasSoja.R3_R5;
    etapas['R7'] = etapas['R5'] + etapasSoja.R5_R7;

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
   * sino... la fecha de la etapa solicitada +- el offset
   */
  private getFechaDesde(
    siembra: ISiembra,
    crono: ICrono,
    prediccionAnterior: IPrediccion = null,
    etapaInicial: 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7',
    offsetDias = 0,
  ) {
    if (prediccionAnterior) {
      const fecha = new Date(prediccionAnterior.fecha);
      fecha.setUTCHours(3, 0, 0, 0);
      fecha.setUTCDate(fecha.getUTCDate() + 1);
      return fecha;
    }
    const fecha = this.getFechaInicioEtapa(siembra, crono, etapaInicial);
    fecha.setUTCHours(3, 0, 0, 0);
    fecha.setUTCDate(fecha.getUTCDate() + offsetDias);

    return fecha;
  }

  /**
   *
   * @returns Fecha hasta que se debe hacer la prediccion,
   * la fecha menor entre la fecha actual y la fecha en que inicia la etapa 7.
   */
  private getFechaHasta(
    siembra: ISiembra,
    crono: ICrono,
    etapaFinal: 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7',
  ) {
    const fechaLimite = this.getFechaInicioEtapa(siembra, crono, etapaFinal);
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
