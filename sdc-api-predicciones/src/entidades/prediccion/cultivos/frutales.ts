import { Injectable, Logger } from '@nestjs/common';
import {
  FRUTALES_MOTOR_SANITARIO_VERSION,
  ICalidadDatoMotor,
  ICreatePrediccion,
  IPrediccion,
  IPrediccionEnfermedad,
  IQueryParam,
  ISerieAgrometeorologicaDia,
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
  metadataResistencia,
} from '../enfermedades/calidad';
import { PrediccionsRepository } from '../repository';

type CultivoFrutal = 'Manzano' | 'Peral' | 'Pecan';

interface ConfigEnfermedadFrutal {
  id: TEnfermedadId;
  nombre: TEnfermedad;
  cultivo: CultivoFrutal;
  etapas: string[];
  tempMin: number;
  tempMax: number;
  humedadMin: number;
  humedadMax?: number;
  mojadoMinHoras?: number;
  fuente: string;
}

const CONFIGURACIONES: ConfigEnfermedadFrutal[] = [
  {
    id: 'manzano.sarna',
    nombre: 'Sarna del Manzano',
    cultivo: 'Manzano',
    etapas: ['yema hinchada', 'punta verde', 'floracion', 'cuaje'],
    tempMin: 6,
    tempMax: 25,
    humedadMin: 85,
    mojadoMinHoras: 6,
    fuente: 'Reglas internas Chaman para monitoreo ambiental de frutales',
  },
  {
    id: 'manzano.oidio',
    nombre: 'Oidio del Manzano',
    cultivo: 'Manzano',
    etapas: ['punta verde', 'floracion', 'cuaje', 'crecimiento de fruto'],
    tempMin: 10,
    tempMax: 28,
    humedadMin: 65,
    humedadMax: 95,
    fuente: 'Reglas internas Chaman para monitoreo ambiental de frutales',
  },
  {
    id: 'frutales.fuego_bacteriano',
    nombre: 'Fuego Bacteriano',
    cultivo: 'Manzano',
    etapas: ['floracion', 'cuaje'],
    tempMin: 16,
    tempMax: 30,
    humedadMin: 70,
    fuente: 'Reglas internas Chaman para monitoreo ambiental de frutales',
  },
  {
    id: 'peral.sarna',
    nombre: 'Sarna del Peral',
    cultivo: 'Peral',
    etapas: ['yema hinchada', 'brotacion', 'floracion', 'cuaje'],
    tempMin: 6,
    tempMax: 25,
    humedadMin: 85,
    mojadoMinHoras: 6,
    fuente: 'Reglas internas Chaman para monitoreo ambiental de frutales',
  },
  {
    id: 'frutales.fuego_bacteriano',
    nombre: 'Fuego Bacteriano',
    cultivo: 'Peral',
    etapas: ['floracion', 'cuaje'],
    tempMin: 16,
    tempMax: 30,
    humedadMin: 70,
    fuente: 'Reglas internas Chaman para monitoreo ambiental de frutales',
  },
  {
    id: 'pecan.sarna',
    nombre: 'Sarna del Pecan',
    cultivo: 'Pecan',
    etapas: ['brotacion', 'polinizacion', 'estado acuoso', 'gel'],
    tempMin: 18,
    tempMax: 30,
    humedadMin: 80,
    mojadoMinHoras: 6,
    fuente: 'Reglas internas Chaman para monitoreo ambiental de frutales',
  },
  {
    id: 'pecan.bacteriosis',
    nombre: 'Bacteriosis del Pecan',
    cultivo: 'Pecan',
    etapas: ['brotacion', 'polinizacion', 'estado acuoso', 'gel'],
    tempMin: 15,
    tempMax: 30,
    humedadMin: 75,
    fuente: 'Reglas internas Chaman para monitoreo ambiental de frutales',
  },
];

@Injectable()
export class PrediccionFrutalesService {
  constructor(
    private readonly repository: PrediccionsRepository,
    private readonly siembras: SiembrasService,
    private readonly clima: ClimaService,
  ) {}

  async hacerPredicciones(siembra: ISiembra): Promise<IPrediccion[]> {
    const cultivo = siembra.semilla?.cultivo as CultivoFrutal;
    const configuraciones = CONFIGURACIONES.filter(
      (item) => item.cultivo === cultivo,
    );
    if (
      !siembra._id ||
      !siembra.fechaSiembra ||
      !siembra.coordenadas ||
      !configuraciones.length
    ) {
      return [];
    }

    const inicioCampania = this.inicioCampania(siembra.fechaSiembra);
    const ultima = await this.ultimaPrediccion(siembra._id);
    const desde = ultima?.fecha
      ? this.siguienteDia(String(ultima.fecha).slice(0, 10))
      : inicioCampania;
    const hasta = this.siguienteDia(this.fechaActual());
    if (desde >= hasta) return [];

    const respuesta = await this.clima.getAgrometeorologiaSiembra(
      siembra._id,
      `${inicioCampania}T00:00:00.000Z`,
      `${hasta}T00:00:00.000Z`,
    );
    const series = (respuesta?.series || []).filter(
      (item) => !item.isForecast && item.date >= desde && item.date < hasta,
    );
    if (!series.length) {
      Logger.warn(
        `Sin serie agrometeorologica canonica para screening frutal ${siembra._id}`,
      );
      return [];
    }

    const creadas: IPrediccion[] = [];
    let ultimaCreada: IPrediccion | undefined;
    for (const serie of series) {
      const enfermedades = configuraciones.map((config) =>
        this.evaluar(config, siembra, serie, respuesta.dataSource),
      );
      const fecha = String(serie.date).slice(0, 10);
      const campo = ['campo', 'proyeccion_anclada_campo'].includes(
        String(serie.stageSource || ''),
      );
      const prediccion: ICreatePrediccion = {
        idSiembra: siembra._id,
        idQuimica: siembra.idQuimica,
        idDistribuidor: siembra.idDistribuidor,
        idProductor: siembra.idProductor,
        idEstablecimiento: siembra.idEstablecimiento,
        fecha: `${fecha}T03:00:00.000Z`,
        fechaPrediccion: fecha,
        nombreEtapa: serie.stage || 'Etapa no verificable',
        fuenteFenologia: campo ? 'observada' : 'agrometeorologia',
        calidadFenologia: this.calidadFenologia(serie, campo),
        enfermedades,
        estacion: {
          idEstacion: respuesta.dataSource?.stationName,
          fuente: this.fuenteClima(serie.source),
          humedadRelativa: this.numero(
            serie.weather?.relativeHumidityMeanPct,
            serie.weather?.relativeHumidityPct,
          ),
          precipitaciones: this.numero(
            serie.weather?.precipitationMm,
            serie.weather?.rainMm,
          ),
          temperaturaMaxima: this.numero(serie.weather?.temperatureMaxC),
          temperaturaMinima: this.numero(serie.weather?.temperatureMinC),
          temperaturaPromedio: this.numero(
            serie.weather?.temperatureMeanC,
            serie.weather?.temperatureC,
          ),
          distanciaMetros: 0,
        },
      };
      ultimaCreada = await this.repository.create(prediccion);
      creadas.push(ultimaCreada);
    }

    if (ultimaCreada) {
      await this.siembras.update(siembra._id, {
        ultimaPrediccion: ultimaCreada,
      });
    }
    return creadas;
  }

  private evaluar(
    config: ConfigEnfermedadFrutal,
    siembra: ISiembra,
    serie: ISerieAgrometeorologicaDia,
    dataSource: { completenessPercentage?: number },
  ): IPrediccionEnfermedad {
    const calidadClima = this.calidadClima(serie, dataSource);
    const etapa = this.normalizar(serie.stage);
    if (!config.etapas.some((item) => etapa.includes(item))) {
      return crearPrediccionFueraVentana(
        config.nombre,
        config.id,
        `Etapa ${serie.stage || 'no verificable'} fuera de la ventana de seguimiento.`,
        config.fuente,
        FRUTALES_MOTOR_SANITARIO_VERSION,
        'experimental',
        { etapaScore: 0 },
      );
    }

    const temperatura = this.numero(
      serie.weather?.temperatureMeanC,
      serie.weather?.temperatureC,
    );
    const humedad = this.numero(
      serie.weather?.relativeHumidityMeanPct,
      serie.weather?.relativeHumidityPct,
    );
    const lluvia = this.numero(
      serie.weather?.precipitationMm,
      serie.weather?.rainMm,
    );
    const mojado = this.numero(serie.metrics?.leafWetnessHours);
    const faltantes = [
      ...(!Number.isFinite(temperatura) ? ['temperaturaMedia'] : []),
      ...(!Number.isFinite(humedad) ? ['humedadRelativa'] : []),
      ...(!Number.isFinite(lluvia) ? ['lluviaDiaria'] : []),
      ...(config.mojadoMinHoras != null &&
      !Number.isFinite(mojado) &&
      !Number.isFinite(humedad)
        ? ['mojadoFoliar']
        : []),
    ];
    if (faltantes.length || calidadClima.nivel === 'sin_datos') {
      const resultado = crearPrediccionSinDatos(
        config.nombre,
        config.id,
        faltantes.length ? faltantes : ['serie_agrometeorologica_canonica'],
        config.fuente,
        FRUTALES_MOTOR_SANITARIO_VERSION,
        'experimental',
      );
      resultado.calidadDatos = combinarCalidadDatos(
        resultado.calidadDatos,
        calidadClima,
      );
      return resultado;
    }

    const resistencia = resolverResistencia(
      siembra.semilla?.resistencia,
      config.id,
    );
    const metadataVarietal = metadataResistencia(resistencia);
    const temperaturaScore = this.factorRango(
      temperatura,
      config.tempMin,
      config.tempMax,
    );
    const humedadScore = this.factorHumedad(
      humedad,
      config.humedadMin,
      config.humedadMax,
    );
    const mojadoEstimado = Number.isFinite(mojado)
      ? mojado
      : humedad >= 92
        ? 12
        : humedad >= 88
          ? 8
          : lluvia > 0
            ? 4
            : 0;
    const mojadoScore = config.mojadoMinHoras
      ? this.clamp(mojadoEstimado / config.mojadoMinHoras, 0, 1)
      : 1;
    const lluviaScore = this.clamp(lluvia / 5, 0, 1);
    const ambiental =
      (temperaturaScore + humedadScore + Math.max(mojadoScore, lluviaScore)) /
      3;
    const indice = this.clamp(
      ambiental * 100 * resistencia.multiplicador,
      0,
      100,
    );
    const calidadDatos = combinarCalidadDatos(
      combinarCalidadDatos(calidadClima, metadataVarietal.calidadDatos),
      {
        nivel: 'baja',
        fuente: 'estimado',
        cobertura: calidadClima.cobertura,
        fallback: true,
        resumen:
          'Screening ambiental experimental ajustado por susceptibilidad varietal; no confirma enfermedad.',
        limitaciones: [
          'Requiere recorrida del lote para confirmar sintomas, inoculo y condiciones del canopeo.',
          'No genera alertas ni prescripciones automaticas.',
        ],
      },
    );
    return {
      enfermedad: config.nombre,
      idEnfermedad: config.id,
      resultado: this.redondear(indice, 2),
      estado: 'calculado',
      resistenciaUsada: metadataVarietal.resistenciaUsada,
      calidadClima,
      calidadDatos,
      modelo: {
        id: config.id,
        version: FRUTALES_MOTOR_SANITARIO_VERSION,
        fuente: config.fuente,
        resolucion: Number.isFinite(mojado) ? 'horaria' : 'proxy_diario',
        validacion: 'experimental',
        alcance:
          'Indice de oportunidad ambiental para recorrida; no equivale a probabilidad, incidencia, severidad ni diagnostico.',
      },
      variables: {
        formulaVersion: FRUTALES_MOTOR_SANITARIO_VERSION,
        temperaturaMedia: this.redondear(temperatura, 1),
        humedadRelativa: this.redondear(humedad, 1),
        lluviaDiaria: this.redondear(lluvia, 1),
        horasMojado: this.redondear(mojadoEstimado, 1),
        temperaturaScore: this.redondear(temperaturaScore, 3),
        humedadScore: this.redondear(humedadScore, 3),
        mojadoScore: this.redondear(mojadoScore, 3),
        lluviaScore: this.redondear(lluviaScore, 3),
        kVar: this.redondear(resistencia.multiplicador, 2),
        etapaScore: 1,
      },
    };
  }

  private calidadClima(
    serie: ISerieAgrometeorologicaDia,
    dataSource: { completenessPercentage?: number },
  ): ICalidadDatoMotor {
    const bloqueos = (serie.qualityFlags || []).filter((item) =>
      item.includes('insufficient_hourly'),
    );
    const cobertura = this.clamp(
      Number(dataSource?.completenessPercentage ?? 0) / 100,
      0,
      1,
    );
    const fuente = String(serie.source || '');
    return {
      nivel: bloqueos.length
        ? 'sin_datos'
        : fuente.includes('sensor')
          ? 'alta'
          : 'media',
      fuente: fuente.includes('sensor')
        ? 'sensor_campo'
        : fuente.includes('station')
          ? 'estacion_asignada'
          : fuente.includes('chaman_meteo')
            ? 'chaman_meteo'
            : fuente.includes('open_meteo') || fuente === 'gap_filled'
              ? 'open_meteo'
              : 'mixto',
      cobertura,
      fallback: bloqueos.length > 0,
      resumen: bloqueos.length
        ? 'La serie meteorologica canonica no tiene cobertura suficiente.'
        : 'Serie meteorologica canonica priorizada por Chamán.',
      limitaciones: bloqueos,
    };
  }

  private calidadFenologia(
    serie: ISerieAgrometeorologicaDia,
    campo: boolean,
  ): ICalidadDatoMotor {
    return {
      nivel: campo ? 'alta' : 'baja',
      fuente: campo ? 'manual' : 'estimado',
      cobertura: serie.stage ? 1 : 0,
      fallback: !campo,
      resumen: campo
        ? 'Etapa registrada o anclada con observacion de campo.'
        : 'Etapa proyectada para screening; requiere confirmacion a campo.',
      limitaciones: campo
        ? []
        : ['La etapa fenologica no fue confirmada a campo.'],
    };
  }

  private async ultimaPrediccion(
    idSiembra: string,
  ): Promise<IPrediccion | undefined> {
    const query: IQueryParam = {
      filter: JSON.stringify({ idSiembra }),
      sort: '-fecha',
      limit: 1,
    };
    const resultado = await this.repository.get(query);
    return resultado.datos[0];
  }

  private inicioCampania(fechaSiembra: string): string {
    const hoy = new Date();
    const year =
      hoy.getUTCMonth() >= 4 ? hoy.getUTCFullYear() : hoy.getUTCFullYear() - 1;
    const campania = `${year}-05-01`;
    const implantacion = String(fechaSiembra).slice(0, 10);
    return implantacion > campania ? implantacion : campania;
  }

  private fechaActual(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private siguienteDia(fecha: string): string {
    const result = new Date(`${fecha}T12:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + 1);
    return result.toISOString().slice(0, 10);
  }

  private factorRango(value: number, min: number, max: number): number {
    if (value < min || value > max) return 0;
    const center = (min + max) / 2;
    const half = Math.max(0.1, (max - min) / 2);
    return this.clamp(1 - Math.abs(value - center) / half, 0.25, 1);
  }

  private factorHumedad(value: number, min: number, max = 100): number {
    if (value < min || value > max) return 0;
    return this.clamp((value - min) / Math.max(1, max - min), 0.25, 1);
  }

  private numero(...values: unknown[]): number {
    const value = values.find(
      (item) =>
        item !== null && item !== undefined && Number.isFinite(Number(item)),
    );
    return value === undefined ? Number.NaN : Number(value);
  }

  private fuenteClima(source: string): any {
    if (source.includes('sensor')) return 'Dispositivo';
    if (source.includes('station')) return 'FieldClimate';
    if (source.includes('chaman_meteo')) return 'ChamanMeteo';
    if (source.includes('open_meteo') || source === 'gap_filled') {
      return 'OpenMeteo';
    }
    return undefined;
  }

  private normalizar(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private redondear(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
