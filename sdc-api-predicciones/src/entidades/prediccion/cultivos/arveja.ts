import { Injectable, Logger } from '@nestjs/common';
import {
  ARVEJA_MOTOR_SANITARIO_VERSION,
  CodigoEtapaArveja,
  evaluarAscochytaArveja,
  evaluarMildiuArveja,
  evaluarOidioArveja,
  TNivelScreeningArveja,
} from 'modelos/src';
import {
  ICalidadDatoMotor,
  ICreatePrediccion,
  IPrediccion,
  IPrediccionEnfermedad,
  IQueryParam,
  ISemilla,
  ISiembra,
  resolverResistencia,
  TEnfermedad,
  TEnfermedadId,
} from 'modelos/src';
import { ClimaService } from '../../clima/service';
import { SiembrasService } from '../../siembra/service';
import {
  combinarCalidadDatos,
  crearPrediccionFueraVentana,
  crearPrediccionSinDatos,
  esValorClimaticoValido,
  metadataResistencia,
} from '../enfermedades/calidad';
import { PrediccionsRepository } from '../repository';
import {
  construirDiasSanitariosCanonicos,
  IDiaSanitarioCanonico,
  indiceEtapaArveja,
  nombreEtapaArveja,
} from './agrometeorologia-canonica';

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
    if (!siembra._id || !siembra.fechaSiembra || !siembra.coordenadas)
      return [];

    const ultimaPrediccion = await this.getUltimaPrediccion(siembra._id);
    const desdeSiembra = this.inicioDia(new Date(siembra.fechaSiembra));
    const fechaDesde = ultimaPrediccion?.fecha
      ? this.diaSiguiente(this.inicioDia(new Date(ultimaPrediccion.fecha)))
      : desdeSiembra;
    const fechaHasta = this.diaSiguiente(this.inicioDia(new Date()));
    if (fechaDesde >= fechaHasta) return [];

    const respuestaCanonica =
      await this.climaService.getAgrometeorologiaSiembra(
        siembra._id,
        desdeSiembra.toISOString(),
        fechaHasta.toISOString(),
      );
    const diasCanonicos = construirDiasSanitariosCanonicos(
      respuestaCanonica,
      'Arveja',
    );
    if (!diasCanonicos.length) {
      Logger.warn(
        `Sin serie agrometeorologica canonica para screening sanitario de Arveja ${siembra._id}`,
      );
      return [];
    }

    const creadas: IPrediccion[] = [];
    let ultimaCreada: IPrediccion | undefined;
    for (const dia of diasCanonicos) {
      const fecha = this.inicioDia(new Date(`${dia.fecha}T00:00:00.000Z`));
      if (fecha < fechaDesde || fecha >= fechaHasta) continue;
      const codigo = dia.etapaArveja;
      const enfermedades =
        !dia.climaHabilitante || !codigo
          ? this.enfermedades.map((config) =>
              crearPrediccionSinDatos(
                config.nombre,
                config.id,
                dia.motivosNoHabilitante.length
                  ? dia.motivosNoHabilitante
                  : ['serie_agrometeorologica_canonica'],
                config.fuente,
                ARVEJA_MOTOR_SANITARIO_VERSION,
                'experimental',
              ),
            )
          : this.enfermedades.map((config) =>
              config.etapas.includes(codigo)
                ? this.evaluarEnfermedad(
                    config,
                    siembra.semilla,
                    this.climaDiaCanonico(dia),
                    codigo,
                    dia.calidadClima,
                  )
                : crearPrediccionFueraVentana(
                    config.nombre,
                    config.id,
                    `Etapa ${codigo}: fuera de la ventana ${config.etapas.join('/')}.`,
                    config.fuente,
                    ARVEJA_MOTOR_SANITARIO_VERSION,
                    'experimental',
                    { etapaScore: 0 },
                  ),
            );
      if (!dia.etapaHabilitante && codigo) {
        for (const enfermedad of enfermedades) {
          enfermedad.calidadDatos = combinarCalidadDatos(
            enfermedad.calidadDatos,
            {
              nivel: 'baja',
              fuente: 'estimado',
              cobertura: dia.calidadClima.cobertura,
              fallback: true,
              resumen:
                'Screening ambiental experimental con etapa fenologica proyectada; no genera alertas automaticas.',
              limitaciones: dia.motivosNoHabilitante,
            },
          );
        }
      }
      if (!enfermedades.length) continue;

      const fechaIso = new Date(`${dia.fecha}T03:00:00.000Z`).toISOString();
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
        etapa: codigo ? indiceEtapaArveja(codigo) : undefined,
        nombreEtapa: codigo
          ? nombreEtapaArveja(codigo)
          : dia.serie.stage || 'Etapa no verificable',
        fuenteFenologia: fuenteCampo ? 'observada' : 'agrometeorologia',
        calidadFenologia: {
          nivel: dia.etapaHabilitante
            ? fuenteCampo
              ? 'alta'
              : 'media'
            : codigo
              ? 'baja'
              : 'sin_datos',
          fuente: fuenteCampo ? 'manual' : 'estimado',
          cobertura: dia.etapaHabilitante ? 1 : codigo ? 0.5 : 0,
          fallback: !dia.etapaHabilitante,
          resumen: dia.etapaHabilitante
            ? `Etapa provista por el motor agrometeorologico canonico (${dia.serie.stageSource}).`
            : codigo
              ? 'Etapa proyectada apta para screening ambiental; requiere confirmacion a campo para alertas.'
              : 'La etapa canonica no habilita decisiones sanitarias.',
          limitaciones: dia.motivosNoHabilitante,
        },
        enfermedades,
        estacion: {
          idEstacion: dia.clima.estacion,
          fuente: dia.clima.fuente,
          distanciaMetros: dia.clima.distancia,
          humedadRelativa: dia.clima.humedad?.avg,
          precipitaciones: dia.clima.lluvia?.sum,
          temperaturaMaxima: dia.clima.temperatura?.max,
          temperaturaMinima: dia.clima.temperatura?.min,
          temperaturaPromedio: dia.clima.temperatura?.avg,
        },
      };

      try {
        ultimaCreada = await this.prediccionsRepository.create(prediccion);
        creadas.push(ultimaCreada);
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
    return creadas;
  }

  private climaDiaCanonico(dia: IDiaSanitarioCanonico): ClimaDiaArveja {
    const humedad = Number(dia.clima.humedad?.avg);
    const lluvia = Number(dia.clima.lluvia?.sum);
    const mojadoHorario = Number(dia.serie.metrics?.leafWetnessHours);
    const tieneMojadoHorario = Number.isFinite(mojadoHorario);
    return {
      hr: humedad,
      tavg: Number(dia.clima.temperatura?.avg),
      tmin: Number(dia.clima.temperatura?.min),
      tmax: Number(dia.clima.temperatura?.max),
      precip: lluvia,
      horasMojado: tieneMojadoHorario
        ? mojadoHorario
        : this.estimarMojadoFoliarDiario(humedad, lluvia),
      coberturaHoraria: dia.calidadClima.cobertura || 0,
      resolucion: tieneMojadoHorario ? 'horaria' : 'proxy_diario',
    };
  }

  /** Proxy conservador de screening; no representa una medicion de campo. */
  private estimarMojadoFoliarDiario(hr: number, lluviaMm: number): number {
    if (!Number.isFinite(hr) || !Number.isFinite(lluviaMm)) return Number.NaN;
    const porHumedad = hr >= 92 ? 12 : hr >= 88 ? 8 : hr >= 82 ? 4 : 0;
    const porLluvia = lluviaMm >= 5 ? 8 : lluviaMm > 0 ? 4 : 0;
    return Math.min(24, Math.max(porHumedad, porLluvia));
  }

  private evaluarEnfermedad(
    config: ConfigEnfermedadArveja,
    semilla: ISemilla | undefined,
    clima: ClimaDiaArveja,
    etapa: CodigoEtapaArveja,
    calidadCanonica: ICalidadDatoMotor,
  ): IPrediccionEnfermedad {
    const requeridos =
      config.id === 'arveja.ascochyta'
        ? ['tavg', 'horasMojado', 'precip']
        : config.id === 'arveja.mildiu'
          ? ['tavg', 'horasMojado', 'hr']
          : ['tavg', 'precip'];
    const faltantes = requeridos.filter(
      (campo) =>
        !esValorClimaticoValido(
          (clima as unknown as Record<string, unknown>)[campo],
        ),
    );
    if (faltantes.length) {
      const sinDatos = crearPrediccionSinDatos(
        config.nombre,
        config.id,
        faltantes,
        config.fuente,
        ARVEJA_MOTOR_SANITARIO_VERSION,
        'experimental',
      );
      sinDatos.calidadDatos = combinarCalidadDatos(
        sinDatos.calidadDatos,
        calidadCanonica,
      );
      return sinDatos;
    }
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
    const resistencia = resolverResistencia(semilla?.resistencia, config.id);
    const metadataVarietal = metadataResistencia(resistencia);
    const resultado = this.clamp(
      evaluacion.indiceAmbiental * resistencia.multiplicador,
      0,
      100,
    );
    return {
      enfermedad: config.nombre,
      idEnfermedad: config.id,
      resultado: this.round(resultado, 2),
      estado: 'calculado',
      resistenciaUsada: metadataVarietal.resistenciaUsada,
      calidadDatos: combinarCalidadDatos(
        resistencia.desconocida
          ? calidadCanonica
          : combinarCalidadDatos(
              calidadCanonica,
              metadataVarietal.calidadDatos,
            ),
        {
          nivel: 'baja',
          fuente: 'estimado',
          cobertura: clima.coberturaHoraria,
          fallback: true,
          resumen: `Screening ambiental experimental ajustado por perfil varietal: nivel ${evaluacion.nivel}. No equivale a probabilidad de infeccion.`,
          limitaciones: [
            ...(metadataVarietal.calidadDatos.limitaciones || []),
            'Sin confirmacion de inoculo, rastrojo, semilla infectada ni sintomas de campo.',
            ...evaluacion.fundamentos,
          ],
        },
      ),
      modelo: {
        id: config.id,
        version: ARVEJA_MOTOR_SANITARIO_VERSION,
        fuente: config.fuente,
        resolucion: clima.resolucion,
        validacion: 'experimental',
      },
      variables: {
        formulaVersion: ARVEJA_MOTOR_SANITARIO_VERSION,
        temperaturaMedia: this.round(clima.tavg, 1),
        humedadRelativa: this.round(clima.hr, 1),
        horasMojado: this.round(clima.horasMojado, 1),
        lluviaDiaria: this.round(clima.precip, 1),
        kVar: this.round(resistencia.multiplicador, 2),
        etapaScore: 1,
        nivelOrdinal: this.nivelOrdinal(evaluacion.nivel),
      },
    };
  }

  private async getUltimaPrediccion(
    idSiembra: string,
  ): Promise<IPrediccion | undefined> {
    const query: IQueryParam = {
      filter: JSON.stringify({ idSiembra }),
      sort: '-fecha',
      limit: 1,
    };
    const resultado = await this.prediccionsRepository.get(query);
    return resultado.datos[0];
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

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
