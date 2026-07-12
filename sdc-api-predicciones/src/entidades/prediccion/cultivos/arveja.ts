import { Injectable, Logger } from '@nestjs/common';
import {
  CodigoEtapaArveja,
  evaluarAscochytaArveja,
  evaluarMildiuArveja,
  evaluarOidioArveja,
  resolverFenologiaTermicaArveja,
  TNivelScreeningArveja,
} from 'modelos/src';
import {
  IClimaEstacionMeteorologica,
  ICreatePrediccion,
  IPrediccion,
  IPrediccionEnfermedad,
  IQueryParam,
  ISiembra,
  TEnfermedad,
  TEnfermedadId,
} from 'modelos/src';
import { HelperService } from '../../../auxiliares/helper';
import { ClimaService } from '../../clima/service';
import { SiembrasService } from '../../siembra/service';
import { getUltimoRegistroFenologicoObservado } from '../fenologia-observada';
import { PrediccionsRepository } from '../repository';

interface ClimaDiaArveja {
  hr: number;
  tavg: number;
  tmin: number;
  tmax: number;
  precip: number;
  horasMojado: number;
  coberturaHoraria: number;
  resolucion: 'horaria' | 'proxy_diario';
}

interface ConfigEnfermedadArveja {
  id: TEnfermedadId;
  nombre: TEnfermedad;
  etapas: CodigoEtapaArveja[];
  fuente: string;
}

@Injectable()
export class PrediccionArvejaService {
  private readonly enfermedades: ConfigEnfermedadArveja[] = [
    {
      id: 'arveja.ascochyta',
      nombre: 'Complejo Ascochyta de la Arveja',
      etapas: ['E', 'R1', 'R3'],
      fuente: 'Roger y Tivoli (1999), Plant Pathology 48:1-9',
    },
    {
      id: 'arveja.mildiu',
      nombre: 'Mildiu de la Arveja',
      etapas: ['E', 'R1'],
      fuente: 'Pegg y Mence (1970), Annals of Applied Biology 66:91-98',
    },
    {
      id: 'arveja.oidio',
      nombre: 'Oidio de la Arveja',
      etapas: ['R1', 'R3'],
      fuente: 'INTA Parana; ventana de monitoreo regional',
    },
  ];

  constructor(
    private prediccionsRepository: PrediccionsRepository,
    private siembrasService: SiembrasService,
    private climaService: ClimaService,
  ) {}

  public async hacerPredicciones(siembra: ISiembra): Promise<IPrediccion[]> {
    if (!siembra._id || !siembra.fechaSiembra || !siembra.coordenadas) return [];

    const ultimaPrediccion = await this.getUltimaPrediccion(siembra._id);
    const desdeSiembra = this.inicioDia(new Date(siembra.fechaSiembra));
    const fechaDesde = ultimaPrediccion?.fecha
      ? this.diaSiguiente(this.inicioDia(new Date(ultimaPrediccion.fecha)))
      : desdeSiembra;
    const fechaHasta = this.diaSiguiente(this.inicioDia(new Date()));
    if (fechaDesde >= fechaHasta) return [];

    const clima = await this.climaService.getEstacionMasCercanaEntreFechas(
      siembra.coordenadas.lat,
      siembra.coordenadas.lng,
      desdeSiembra.toISOString(),
      fechaHasta.toISOString(),
      'hourly',
      siembra.establecimiento,
    );
    if (!clima.length) {
      Logger.warn(`Sin clima para screening sanitario de Arveja ${siembra._id}`);
      return [];
    }

    const dias = this.agruparClimaPorDia(clima);
    let gddAcumulados = 0;
    const creadas: IPrediccion[] = [];
    let ultimaCreada: IPrediccion | undefined;

    for (
      let fecha = new Date(desdeSiembra);
      fecha < fechaHasta;
      fecha = this.diaSiguiente(fecha)
    ) {
      const fechaKey = this.fechaKey(fecha);
      const climaDia = dias.get(fechaKey);
      if (!climaDia || !Number.isFinite(climaDia.tavg)) continue;
      const temperaturaBase = Number(
        siembra.semilla?.fenologiaReferencia?.temperaturaBaseC ?? 3,
      );
      gddAcumulados += Math.max(climaDia.tavg - temperaturaBase, 0);
      if (fecha < fechaDesde) continue;

      const registro = getUltimoRegistroFenologicoObservado(siembra, fecha);
      const fenologia = resolverFenologiaTermicaArveja({
        referencia: siembra.semilla?.fenologiaReferencia,
        gradosDiaAcumulados: gddAcumulados,
        etapaCampo: registro?.etapa,
      });
      const enfermedades = this.enfermedades
        .filter((config) => config.etapas.includes(fenologia.codigo))
        .map((config) =>
          this.evaluarEnfermedad(config, climaDia, fenologia.codigo),
        );
      if (!enfermedades.length) continue;

      const fechaIso = new Date(`${fechaKey}T03:00:00.000Z`).toISOString();
      const prediccion: ICreatePrediccion = {
        idSiembra: siembra._id,
        idQuimica: siembra.idQuimica,
        idDistribuidor: siembra.idDistribuidor,
        idProductor: siembra.idProductor,
        idEstablecimiento: siembra.idEstablecimiento,
        fecha: fechaIso,
        fechaPrediccion: fechaKey,
        etapa: fenologia.indice,
        nombreEtapa: fenologia.nombre,
        fuenteFenologia: registro ? 'observada' : 'crono',
        registroFenologicoId: registro?.id,
        calidadFenologia: {
          nivel: registro ? 'alta' : 'media',
          fuente: registro ? 'manual' : 'estimado',
          cobertura: 1,
          fallback: !registro,
          resumen: registro
            ? 'Etapa de Arveja observada a campo.'
            : `Etapa termica estimada con ${gddAcumulados.toFixed(1)} GDD.`,
          limitaciones: fenologia.advertencias,
        },
        enfermedades,
        estacion: {
          idEstacion: clima[0].estacion,
          distanciaMetros: clima[0].distancia,
          humedadRelativa: climaDia.hr,
          precipitaciones: climaDia.precip,
          temperaturaMaxima: climaDia.tmax,
          temperaturaMinima: climaDia.tmin,
          temperaturaPromedio: climaDia.tavg,
        },
      };

      try {
        ultimaCreada = await this.prediccionsRepository.create(prediccion);
        creadas.push(ultimaCreada);
      } catch (error) {
        Logger.error(error);
      }
    }

    if (ultimaCreada) {
      await this.siembrasService.update(siembra._id, {
        ultimaPrediccion: ultimaCreada,
      });
    }
    return creadas;
  }

  private evaluarEnfermedad(
    config: ConfigEnfermedadArveja,
    clima: ClimaDiaArveja,
    etapa: CodigoEtapaArveja,
  ): IPrediccionEnfermedad {
    const evaluacion =
      config.id === 'arveja.ascochyta'
        ? evaluarAscochytaArveja({
            temperatura: clima.tavg,
            horasMojado: clima.horasMojado,
            lluviaMm: clima.precip,
          })
        : config.id === 'arveja.mildiu'
          ? evaluarMildiuArveja({
              temperatura: clima.tavg,
              horasMojado: clima.horasMojado,
              humedadRelativa: clima.hr,
            })
          : evaluarOidioArveja({
              temperatura: clima.tavg,
              lluviaMm: clima.precip,
              etapaReproductiva: etapa === 'R1' || etapa === 'R3',
            });
    return {
      enfermedad: config.nombre,
      idEnfermedad: config.id,
      resultado: evaluacion.indiceAmbiental,
      estado: 'calculado',
      resistenciaUsada: { estado: 'desconocida' },
      calidadDatos: {
        nivel: 'baja',
        fuente: clima.resolucion === 'horaria' ? 'mixto' : 'estimado',
        cobertura: clima.coberturaHoraria,
        fallback: clima.resolucion !== 'horaria',
        resumen: `Screening ambiental experimental: nivel ${evaluacion.nivel}. No equivale a probabilidad de infeccion.`,
        limitaciones: [
          'Sin resistencia varietal publicada; ausencia de dato no equivale a susceptibilidad.',
          'Sin confirmacion de inoculo, rastrojo, semilla infectada ni sintomas de campo.',
          ...evaluacion.fundamentos,
        ],
      },
      modelo: {
        id: config.id,
        version: 1,
        fuente: config.fuente,
        resolucion: clima.resolucion,
      },
      variables: {
        formulaVersion: 1,
        temperaturaMedia: this.round(clima.tavg, 1),
        humedadRelativa: this.round(clima.hr, 1),
        horasMojado: this.round(clima.horasMojado, 1),
        lluviaDiaria: this.round(clima.precip, 1),
        etapaScore: 1,
        nivelOrdinal: this.nivelOrdinal(evaluacion.nivel),
      },
    };
  }

  private agruparClimaPorDia(
    clima: IClimaEstacionMeteorologica[],
  ): Map<string, ClimaDiaArveja> {
    const grupos = new Map<string, IClimaEstacionMeteorologica[]>();
    for (const fila of clima) {
      const fecha = String(fila.fecha || '').slice(0, 10);
      if (!fecha) continue;
      grupos.set(fecha, [...(grupos.get(fecha) || []), fila]);
    }
    const salida = new Map<string, ClimaDiaArveja>();
    for (const [fecha, filas] of grupos) {
      const temperaturas = filas
        .map((item) => Number(item.temperatura?.avg ?? item.temperatura?.last))
        .filter(Number.isFinite);
      const humedades = filas
        .map((item) => Number(item.humedad?.avg ?? item.humedad?.last))
        .filter(Number.isFinite);
      const horaria = filas.length >= 18 && temperaturas.length >= 18 && humedades.length >= 18;
      const hr = horaria ? this.promedio(humedades) : Number(HelperService.getHR(clima, fecha));
      const tavg = horaria ? this.promedio(temperaturas) : Number(HelperService.getTAvg(clima, fecha));
      const precip = horaria
        ? filas.reduce((sum, item) => sum + Number(item.lluvia?.sum ?? item.lluvia?.last ?? 0), 0)
        : Number(HelperService.getPrecip(clima, fecha));
      salida.set(fecha, {
        hr,
        tavg,
        tmin: horaria ? Math.min(...temperaturas) : Number(HelperService.getTMin(clima, fecha)),
        tmax: horaria ? Math.max(...temperaturas) : Number(HelperService.getTMax(clima, fecha)),
        precip,
        horasMojado: horaria
          ? humedades.filter((value) => value >= 90).length * (24 / humedades.length)
          : this.horasMojadoProxy(hr),
        coberturaHoraria: horaria ? Math.min(humedades.length / 24, 1) : 0,
        resolucion: horaria ? 'horaria' : 'proxy_diario',
      });
    }
    return salida;
  }

  private async getUltimaPrediccion(idSiembra: string): Promise<IPrediccion | undefined> {
    const query: IQueryParam = {
      filter: JSON.stringify({ idSiembra }),
      sort: '-fecha',
      limit: 1,
    };
    const resultado = await this.prediccionsRepository.get(query);
    return resultado.datos[0];
  }

  private horasMojadoProxy(hr: number): number {
    if (hr >= 91) return 12;
    if (hr >= 85) return 6;
    return 0;
  }

  private promedio(values: number[]): number {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : Number.NaN;
  }

  private nivelOrdinal(nivel: TNivelScreeningArveja): number {
    return nivel === 'alto' ? 3 : nivel === 'medio' ? 2 : 1;
  }

  private inicioDia(fecha: Date): Date {
    const result = new Date(fecha);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }

  private diaSiguiente(fecha: Date): Date {
    const result = new Date(fecha);
    result.setUTCDate(result.getUTCDate() + 1);
    return result;
  }

  private fechaKey(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }

  private round(value: number, digits = 1): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
}
