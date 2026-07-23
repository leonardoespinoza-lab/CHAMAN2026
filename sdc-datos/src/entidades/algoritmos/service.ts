import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  IDispositivo,
  IHuellaHidrica,
  ILote,
  IMaleza,
  IPrediccionMalezaDia,
  IPrediccionMalezaEspecie,
  IPrediccionMalezaUmbral,
  IResultadoPrediccionMalezas,
  ISiembra,
  TCalidadPrediccionMalezas,
  TSeveridadPrediccionMaleza,
} from 'modelos/src';
import { CronosService } from '../crono/service';
import { EnfermedadsService } from '../enfermedad/service';
import { MalezasService } from '../maleza/service';
import { SemillasService } from '../semilla/service';
import {
  calcularHuellaHidrica,
  calcularSeguimientoHuellaHidrica,
  DiaClimaHuella,
  getHuellaHidricaConstantes,
  HuellaHidricaParams,
  HuellaHidricaResultado,
  HuellaHidricaSeguimientoResultado,
} from './huella-hidrica.engine';
import {
  acumularSeveridadManchaRed,
  calcularEscaldadura,
  calcularFinCicloSoja,
  calcularFusariumEspiga,
  calcularFusariumEspigaCrudo,
  calcularManchaAmarilla,
  calcularManchaAmarillaCrudo,
  calcularManchaHoja,
  calcularManchaHojaCrudo,
  calcularRoyaAnaranjadaTrigo2026,
  calcularRoyaAnaranjadaTrigo2026Crudo,
  calcularRoyaHoja,
  calcularRoyaHojaTrigo2026,
  calcularRoyaHojaTrigo2026Crudo,
  evaluarAscochytaArveja,
  evaluarMildiuArveja,
  evaluarOidioArveja,
  gradosDiaBase0,
  gradosDiaRoya,
  gradosDiaRoyaAnaranjada,
  gradosDiaRoyaMaiz,
  getEnfermedadCanonica,
  resolverResistencia,
  tasaDiariaManchaRedHoraria,
  TRIGO_FUSARIUM_GDD_BASE_0_MAX,
  TRIGO_MOTOR_SANITARIO_VERSION,
} from 'modelos/src';

export interface AlgoritmoCatalogo {
  id: string;
  nombre: string;
  estado: 'operativo' | 'auditable' | 'configurable';
  descripcion: string;
  inputs: string[];
  outputs: string[];
}

export interface ReadinessCultivoCatalogo {
  cultivo: string;
  ok: boolean;
  semillas: number;
  semillasConResistencia?: number;
  semillasConCrono?: number;
  coberturaResistenciaEnfermedades?: Array<{
    idEnfermedad: string;
    enfermedad: string;
    conEntrada: number;
    observadas: number;
    historicas: number;
    inferidas: number;
    desconocidas: number;
    total: number;
    coberturaMatrizPct: number;
    coberturaValidadaPct: number;
  }>;
  enfermedades: number;
  enfermedadesMotor?: number;
  fuenteEnfermedades?: string;
  cronos: number;
  malezas: number;
  calidadCatalogo?: 'completa' | 'parcial' | 'incompleta';
  observaciones?: string[];
  faltantes: string[];
}

interface DiaClimaMalezas {
  fecha: string;
  tipo: 'historico' | 'pronostico';
  temperaturaMedia?: number;
  lluviaMm?: number;
  et0Mm?: number;
}

interface SensorSueloReferencia {
  temperatura?: number;
  humedad?: number;
}

interface ResistenciaSimulador {
  idEnfermedad?: string;
  enfermedad?: string;
  multiplicador?: number;
  indiceResistencia?: number;
  perfil?: string;
  estado?: string;
  confianza?: string;
  campaniaFuente?: string;
  fechaFuente?: string;
  fuente?: string;
  fuenteUrl?: string;
}

@Injectable()
export class AlgoritmosService {
  private readonly logger = new Logger(AlgoritmosService.name);
  private readonly cultivosMalezas = ['Trigo', 'Soja', 'Maiz'];
  private readonly diasPronosticoMalezas = 7;
  private readonly maxDiasHistoricoMalezas = 180;

  constructor(
    private readonly cronosService: CronosService,
    private readonly enfermedadsService: EnfermedadsService,
    private readonly malezasService: MalezasService,
    private readonly semillasService: SemillasService,
  ) {}

  getCatalogo(): AlgoritmoCatalogo[] {
    return [
      {
        id: 'huella-hidrica',
        nombre: 'Huella hidrica',
        estado: 'operativo',
        descripcion:
          'Calcula huella verde, azul, gris y total al cosechar. Usa ETc/Kc, lluvia efectiva, fertilizaciones y fumigaciones.',
        inputs: [
          'Siembra: cultivo, fecha de siembra/cosecha, rendimiento seco, labranza, dosis N/P y manejo',
          'Lote: suelo, drenaje, pendiente, deposito N y contenido P',
          'Clima diario: precipitacion y ET0',
          'Fertilizaciones: dosis y composicion N/P',
          'Fumigaciones: principio activo, concentracion y dosis',
        ],
        outputs: [
          'litros/kg verde',
          'litros/kg azul',
          'litros/kg gris',
          'litros/kg total',
          'traza de calculo',
        ],
      },
      {
        id: 'enfermedades',
        nombre: 'Prediccion de enfermedades',
        estado: 'auditable',
        descripcion:
          'Cruza susceptibilidad varietal, etapa fenologica, zona/ciclo, humedad persistente, lluvia y temperatura por cultivo.',
        inputs: [
          'Cultivo y variedad',
          'Fenologia',
          'Zona/ciclo',
          'Humedad relativa',
          'Lluvia',
          'Temperatura',
        ],
        outputs: [
          'riesgo por enfermedad',
          'periodo critico',
          'prescripcion orientativa',
        ],
      },
      {
        id: 'riego',
        nombre: 'Recomendacion de riego',
        estado: 'auditable',
        descripcion:
          'Motor V12: requiere lanza/sonda de humedad, cruza dia/noche, raices, capacidad de campo, PMP, ET0, Kc y lluvia efectiva.',
        inputs: [
          'Lanza de humedad de suelo por profundidad',
          'Capacidad de campo estimada o cargada',
          'Punto de marchitez permanente',
          'Raices activas por nivel',
          'ET0, Kc, lluvia y probabilidad de lluvia',
          'Capacidad diaria de riego, bulbo y metros lineales por hectarea',
        ],
        outputs: [
          'agua util mm/%',
          'deficit mm',
          'demanda 72 h',
          'lluvia efectiva',
          'recomendacion mm',
          'traza auditable',
        ],
      },
      {
        id: 'malezas',
        nombre: 'Prediccion de malezas',
        estado: 'auditable',
        descripcion:
          'Evalua emergencia de malezas para trigo, soja y maiz usando acumulacion termica/hidrica y parametros Gompertz.',
        inputs: [
          'Cultivo',
          'Temperatura',
          'Humedad/lluvia',
          'Parametros por especie',
        ],
        outputs: [
          'probabilidad de emergencia',
          'ventana de control',
          'curva estimada',
        ],
      },
    ];
  }

  getParametrosHuellaHidrica() {
    return getHuellaHidricaConstantes();
  }

  async getReadinessCatalogos() {
    const cultivos = ['Trigo', 'Cebada', 'Soja', 'Maiz', 'Arveja'];
    const resultados = await Promise.all(
      cultivos.map((cultivo) => this.getReadinessCultivo(cultivo)),
    );
    return {
      ok: resultados.every((item) => item.ok),
      fecha: new Date().toISOString(),
      minimos: {
        semillas: 1,
        enfermedades: 1,
        cronos: 1,
        malezas: 'obligatorio solo para Trigo, Soja y Maiz',
      },
      cultivos: resultados,
    };
  }

  simularHuellaHidrica(params: HuellaHidricaParams): HuellaHidricaResultado {
    return calcularHuellaHidrica(params);
  }

  simularSeguimientoHuellaHidrica(
    params: HuellaHidricaParams,
  ): HuellaHidricaSeguimientoResultado {
    return calcularSeguimientoHuellaHidrica(params);
  }

  private async getReadinessCultivo(
    cultivo: string,
  ): Promise<ReadinessCultivoCatalogo> {
    const [catalogoSemillas, enfermedades, cronos, malezas] = await Promise.all(
      [
        this.semillasService.getFilter({
          filter: JSON.stringify({ cultivo }),
          limit: 0,
          page: 0,
          select: '_id ciclo resistencia',
        }),
        this.countByFilter(this.enfermedadsService, { cultivo }),
        this.countByFilter(this.cronosService, { cultivo }),
        this.countByFilter(this.malezasService, { cultivosObjetivo: cultivo }),
      ],
    );
    const filasSemillas = Array.isArray(catalogoSemillas?.datos)
      ? (catalogoSemillas.datos as any[])
      : [];
    const semillas = Number(
      catalogoSemillas?.totalCount || filasSemillas.length,
    );
    const esEvidenciaSanitariaEspecifica = (resistencia: any) =>
      ['observada', 'historica'].includes(
        String(resistencia?.estado || '').toLowerCase(),
      ) ||
      (!resistencia?.estado &&
        resistencia?.multiplicador != null &&
        Number.isFinite(Number(resistencia.multiplicador)));
    const semillasConResistencia = filasSemillas.filter((semilla) =>
      (semilla?.resistencia || []).some(esEvidenciaSanitariaEspecifica),
    ).length;
    const semillasConCrono = filasSemillas.filter((semilla) => {
      const ciclo = String(semilla?.ciclo || '')
        .trim()
        .toUpperCase();
      return ciclo && ciclo !== 'SIN DEFINIR';
    }).length;
    const enfermedadesMotor = this.getEnfermedadesCultivo(cultivo).length;
    const enfermedadesOperativas = this.getEnfermedadesCultivo(cultivo)
      .map((item) => getEnfermedadCanonica(item.nombre))
      .filter((item) => item?.motor === 'operativo');
    const requiereMatrizResistencia = this.norm(cultivo) !== 'ARVEJA';
    const coberturaResistenciaEnfermedades = (
      requiereMatrizResistencia ? enfermedadesOperativas : []
    ).map((enfermedad) => {
      const entradas = filasSemillas
        .map((semilla) =>
          (semilla?.resistencia || []).find(
            (item: any) =>
              item?.idEnfermedad === enfermedad.id ||
              item?.enfermedad === enfermedad.nombre,
          ),
        )
        .filter(Boolean);
      const countEstado = (estado: string) =>
        entradas.filter(
          (item: any) => String(item?.estado || '').toLowerCase() === estado,
        ).length;
      const conEntrada = entradas.length;
      const observadas = countEstado('observada');
      const historicas = countEstado('historica');
      const inferidas = countEstado('inferida');
      const desconocidas = countEstado('desconocida');
      const validadas = observadas + historicas;
      return {
        idEnfermedad: enfermedad.id,
        enfermedad: enfermedad.nombre,
        conEntrada,
        observadas,
        historicas,
        inferidas,
        desconocidas,
        total: semillas,
        coberturaMatrizPct: semillas
          ? this.round((conEntrada / semillas) * 100, 1)
          : 0,
        coberturaValidadaPct: semillas
          ? this.round((validadas / semillas) * 100, 1)
          : 0,
      };
    });
    const tieneEnfermedades = enfermedades > 0 || enfermedadesMotor > 0;
    const requiereMalezas = this.cultivosMalezas.includes(cultivo);
    const faltantes: string[] = [];
    const observaciones: string[] = [];
    if (!semillas) faltantes.push('semillas');
    if (!tieneEnfermedades) faltantes.push('enfermedades');
    if (!cronos && this.norm(cultivo) !== 'ARVEJA') faltantes.push('cronos');
    if (requiereMalezas && !malezas) faltantes.push('malezas');
    for (const cobertura of coberturaResistenciaEnfermedades) {
      if (cobertura.conEntrada < cobertura.total) {
        faltantes.push(`matriz-resistencia:${cobertura.idEnfermedad}`);
      }
      if (cobertura.coberturaValidadaPct < 100) {
        observaciones.push(
          `${cobertura.idEnfermedad}: ${cobertura.coberturaValidadaPct}% con perfil observado/historico; ` +
            `${cobertura.desconocidas} variedad(es) usan escenario conservador y confianza baja`,
        );
      }
    }
    if (
      semillas &&
      semillasConResistencia < semillas &&
      requiereMatrizResistencia
    ) {
      observaciones.push(
        `${semillas - semillasConResistencia} variedad(es) sin resistencia sanitaria especifica`,
      );
    }
    if (this.norm(cultivo) === 'ARVEJA') {
      observaciones.push(
        'Piloto experimental: fenologia termica desde la semilla; resistencia varietal sin datos y sin prescripciones/alertas automaticas',
      );
    }
    if (semillas && semillasConCrono < semillas) {
      observaciones.push(
        `${semillas - semillasConCrono} variedad(es) sin ciclo/crono robusto`,
      );
    }
    if (!enfermedades && enfermedadesMotor) {
      observaciones.push(
        'Enfermedades provistas por motor interno; falta espejo completo en coleccion de enfermedades',
      );
    }
    const calidadCatalogo =
      faltantes.length > 0
        ? 'incompleta'
        : observaciones.length
          ? 'parcial'
          : 'completa';

    return {
      cultivo,
      ok: faltantes.length === 0,
      semillas,
      semillasConResistencia,
      semillasConCrono,
      coberturaResistenciaEnfermedades,
      enfermedades,
      enfermedadesMotor,
      fuenteEnfermedades:
        this.norm(cultivo) === 'ARVEJA'
          ? 'motor-experimental'
          : enfermedades
            ? 'base-datos'
            : enfermedadesMotor
              ? 'motor-formulas'
              : 'sin-base',
      cronos,
      malezas,
      calidadCatalogo,
      observaciones,
      faltantes,
    };
  }

  private async countByFilter(
    service: { getFilter: (query: any) => Promise<{ totalCount?: number }> },
    filter: any,
  ) {
    const resultado = await service.getFilter({
      filter: JSON.stringify(filter),
      limit: 0,
      page: 0,
      select: '_id',
    });
    return Number(resultado?.totalCount || 0);
  }

  simularEnfermedades(body: any) {
    const cultivo = body?.cultivo || 'Trigo';
    const variedad = body?.variedad || 'Variedad sensible';
    const etapa = body?.etapa || 'Hoja bandera';
    const zona = body?.zona || body?.departamento || 'Zona sin definir';
    const humedad = Number(body?.humedadRelativa ?? 88);
    const horasMojado = Number(body?.horasMojado ?? 18);
    const lluvia48 = Number(body?.lluvia48h ?? 12);
    const temperatura = Number(body?.temperatura ?? 18);
    const susceptibilidad = Number(body?.susceptibilidad ?? 0.7);
    const resistenciasVarietales = Array.isArray(body?.resistencia)
      ? body.resistencia
      : Array.isArray(body?.resistencias)
        ? body.resistencias
        : [];

    if (this.norm(cultivo) === 'CEBADA') {
      return this.simularEnfermedadesCebada({
        cultivo,
        variedad,
        etapa,
        zona,
        humedad,
        horasMojado,
        lluvia48,
        temperatura,
        susceptibilidad,
        resistenciasVarietales,
        diasSimulados: Number(body?.diasSimulados ?? 10),
      });
    }

    if (this.norm(cultivo) === 'TRIGO') {
      return this.simularEnfermedadesTrigo({
        cultivo,
        variedad,
        etapa,
        zona,
        humedad,
        horasMojado,
        lluvia48,
        temperatura,
        susceptibilidad,
        resistenciasVarietales,
        diasSimulados: Number(body?.diasSimulados ?? 10),
      });
    }

    if (this.norm(cultivo) === 'MAIZ') {
      return this.simularEnfermedadesMaiz({
        cultivo,
        variedad,
        etapa,
        zona,
        humedad,
        lluvia48,
        temperatura,
        susceptibilidad,
        resistenciasVarietales,
        diasSimulados: Number(body?.diasSimulados ?? 10),
      });
    }

    if (this.norm(cultivo) === 'SOJA') {
      return this.simularEnfermedadesSoja({
        cultivo,
        variedad,
        etapa,
        zona,
        lluvia48,
        susceptibilidad,
        resistenciasVarietales,
        diasSimulados: Number(body?.diasSimulados ?? 10),
      });
    }

    if (this.norm(cultivo) === 'ARVEJA') {
      return this.simularEnfermedadesArveja({
        cultivo,
        variedad,
        etapa,
        zona,
        humedad,
        horasMojado,
        lluvia48,
        temperatura,
      });
    }

    const enfermedades = this.getEnfermedadesCultivo(cultivo).map(
      (enfermedad) => {
        const etapaActiva = enfermedad.etapas.some(
          (item) => item.toLowerCase() === String(etapa).toLowerCase(),
        );
        const humedadScore = this.clamp(
          (humedad - enfermedad.humedadBase) / 18,
          0,
          1,
        );
        const mojadoScore = this.clamp(
          horasMojado / enfermedad.horasMojadoCriticas,
          0,
          1,
        );
        const lluviaScore = this.clamp(
          lluvia48 / enfermedad.lluviaCritica,
          0,
          1,
        );
        const tempScore = this.clamp(
          1 - Math.abs(temperatura - enfermedad.tempOptima) / 14,
          0,
          1,
        );
        const etapaScore = etapaActiva ? 1 : 0.42;
        const susceptibilidadEnfermedad = this.getSusceptibilidadVarietal(
          enfermedad.nombre,
          susceptibilidad,
          resistenciasVarietales,
        );
        const riesgo = this.round(
          100 *
            (0.25 * humedadScore +
              0.22 * mojadoScore +
              0.16 * lluviaScore +
              0.17 * tempScore +
              0.12 * susceptibilidadEnfermedad +
              0.08 * etapaScore),
          1,
        );

        return {
          nombre: enfermedad.nombre,
          periodo: enfermedad.periodo,
          riesgo,
          nivel: this.nivelRiesgo(riesgo),
          prescripcion: enfermedad.prescripcion,
          etapaActiva,
          susceptibilidad: this.round(susceptibilidadEnfermedad, 2),
        };
      },
    );

    const maxRiesgo = Math.max(...enfermedades.map((item) => item.riesgo), 0);
    const serie = Array.from({ length: 10 }).map((_, index) => {
      const humedadDia = humedad + Math.sin(index / 1.5) * 5;
      const mojadoDia = Math.max(0, horasMojado - 6 + index * 1.2);
      const riesgo = this.clamp(
        maxRiesgo * 0.55 + humedadDia * 0.18 + mojadoDia * 1.2 - index * 1.4,
        0,
        100,
      );
      return { label: `Dia ${index + 1}`, value: this.round(riesgo, 1) };
    });

    return {
      motor: 'enfermedades',
      resumen: `${cultivo} ${variedad}: ${this.nivelRiesgo(maxRiesgo)} (${this.round(maxRiesgo, 1)}%)`,
      metricas: {
        cultivo,
        variedad,
        etapa,
        zona,
        humedadRelativa: humedad,
        horasMojado,
        lluvia48h: lluvia48,
        temperatura,
        fuenteVarietal: resistenciasVarietales.length
          ? 'semilla.resistencia'
          : 'sensibilidad base manual',
      },
      enfermedades,
      serie,
      trazas: [
        'Riesgo = humedad persistente + horas de mojado + lluvia + temperatura + susceptibilidad varietal + ventana fenologica.',
        `Etapa evaluada: ${etapa}. Humedad ${humedad}%, mojado ${horasMojado} h, lluvia 48 h ${lluvia48} mm.`,
        `Zona evaluada: ${zona}. En produccion el crono se resuelve por departamento, ciclo y fecha de siembra.`,
        resistenciasVarietales.length
          ? `Susceptibilidad por enfermedad tomada de semilla.resistencia (${resistenciasVarietales.length} registro(s)).`
          : 'Sin resistencia varietal especifica: se uso susceptibilidad base manual para todas las enfermedades.',
      ],
    };
  }

  private simularEnfermedadesTrigo(params: {
    cultivo: string;
    variedad: string;
    etapa: string;
    zona: string;
    humedad: number;
    horasMojado: number;
    lluvia48: number;
    temperatura: number;
    susceptibilidad: number;
    resistenciasVarietales: ResistenciaSimulador[];
    diasSimulados: number;
  }) {
    const dias = Math.max(
      1,
      Math.min(90, Math.round(params.diasSimulados || 10)),
    );
    const lluviaDiaria = Math.max(0, params.lluvia48 / 2);
    const tmin = params.temperatura - 4;
    const tmax = params.temperatura + 5;
    const enfermedadesBase = this.getEnfermedadesCultivo('Trigo');
    const seriePorEnfermedad: Record<
      string,
      Array<{ label: string; value: number }>
    > = {};

    const enfermedades = enfermedadesBase.map((enfermedad) => {
      const etapaActiva = enfermedad.etapas.some(
        (item) => this.norm(item) === this.norm(params.etapa),
      );
      const perfilVarietal = this.getPerfilVarietal(
        enfermedad.nombre,
        params.susceptibilidad,
        params.resistenciasVarietales,
      );
      const kVar = perfilVarietal.multiplicador;
      const esRoyaAmarillaExperimental =
        enfermedad.nombre === 'Roya Anaranjada';
      const validacion = esRoyaAmarillaExperimental
        ? 'experimental'
        : 'operativo_provisional';
      let riesgo = 0;
      let resultadoCrudo = 0;
      let DPr = 0;
      let DPrHRT = 0;
      let DHR = 0;
      let GD = 0;
      let DL = 0;
      let PMoj = 0;
      let GDN = 0;
      let GDAcum = 0;
      let fusariumFueraVentana = false;
      let resultadoContractualCrudo = 0;
      let resultadoContractualLimitado = 0;

      const serie = Array.from({ length: dias }).map((_, index) => {
        const label = `Dia ${index + 1}`;
        if (!etapaActiva) {
          return { label, value: 0 };
        }

        if (enfermedad.nombre === 'Mancha Amarilla') {
          DPr += lluviaDiaria > 2 ? 1 : 0;
          DPrHRT +=
            lluviaDiaria > 1 && params.humedad >= 80 && tmax <= 32 && tmin >= 8
              ? 1
              : 0;
          resultadoCrudo = calcularManchaAmarillaCrudo(DPrHRT, DPr, kVar);
          riesgo = calcularManchaAmarilla(DPrHRT, DPr, kVar);
        } else if (enfermedad.nombre === 'Mancha de la Hoja') {
          DPr += lluviaDiaria > 10 ? 1 : 0;
          DHR += params.humedad >= 80 ? 1 : 0;
          resultadoCrudo = calcularManchaHojaCrudo(DHR, DPr, kVar);
          riesgo = calcularManchaHoja(DHR, DPr, kVar);
        } else if (enfermedad.nombre === 'Roya de la Hoja') {
          GD += gradosDiaRoya(params.humedad, params.temperatura);
          DHR += lluviaDiaria <= 0.2 && params.humedad > 70 ? 1 : 0;
          resultadoCrudo = calcularRoyaHojaTrigo2026Crudo(GD, DHR, kVar);
          riesgo = calcularRoyaHojaTrigo2026(GD, DHR, kVar);
        } else if (enfermedad.nombre === 'Roya Anaranjada') {
          GD += gradosDiaRoyaAnaranjada(params.humedad, params.temperatura);
          DHR += params.humedad > 75 && lluviaDiaria <= 5 ? 1 : 0;
          DL += lluviaDiaria >= 0.1 && lluviaDiaria <= 2 ? 1 : 0;
          resultadoContractualCrudo = calcularRoyaAnaranjadaTrigo2026Crudo(
            GD,
            DHR,
            DL,
            kVar,
          );
          resultadoContractualLimitado = calcularRoyaAnaranjadaTrigo2026(
            GD,
            DHR,
            DL,
            kVar,
          );
          // El banco manual es diario y no puede fabricar las 240 horas que
          // exige el modelo publicado. El contrato queda trazado en sombra,
          // pero la salida ambiental permanece sin calculo.
          resultadoCrudo = 0;
          riesgo = 0;
        } else if (enfermedad.nombre === 'Fusarium de la Espiga') {
          if (GDAcum < TRIGO_FUSARIUM_GDD_BASE_0_MAX) {
            GDAcum = Math.min(
              TRIGO_FUSARIUM_GDD_BASE_0_MAX,
              GDAcum + gradosDiaBase0(params.temperatura),
            );
            const diaAnteriorConLluviaYHr =
              lluviaDiaria >= 0.2 && params.humedad > 81;
            const diaActualConHr = params.humedad >= 78;
            PMoj +=
              index > 0 && diaAnteriorConLluviaYHr && diaActualConHr ? 1 : 0;
            GDN += Math.max(tmax - 26, 0) + Math.max(9 - tmin, 0);
            resultadoCrudo = calcularFusariumEspigaCrudo(PMoj, GDN, kVar);
            riesgo = calcularFusariumEspiga(PMoj, GDN, kVar, true);
          } else {
            fusariumFueraVentana = true;
            riesgo = 0;
          }
        }

        return { label, value: this.round(riesgo, 1) };
      });

      seriePorEnfermedad[enfermedad.nombre] = serie;
      const ultimo = serie[serie.length - 1]?.value || 0;
      const estadoCalculo = esRoyaAmarillaExperimental
        ? etapaActiva
          ? 'sin_datos'
          : 'fuera_ventana'
        : etapaActiva && !fusariumFueraVentana
          ? 'calculado'
          : 'fuera_ventana';
      const resistenciaUsada = {
        multiplicador: this.round(kVar, 2),
        perfil: perfilVarietal.perfil,
        estado: perfilVarietal.estado,
        confianza: perfilVarietal.confianza,
        fuente: perfilVarietal.fuente,
        fuenteUrl: perfilVarietal.fuenteUrl,
        campaniaFuente: perfilVarietal.campaniaFuente,
        coherente: perfilVarietal.coherente,
        escenarioManual: perfilVarietal.escenarioManual,
        alertable: false,
        limitaciones: perfilVarietal.limitaciones,
      };

      return {
        nombre: enfermedad.nombre,
        periodo: enfermedad.periodo,
        estado: estadoCalculo,
        riesgo: this.round(ultimo, 1),
        nivel: esRoyaAmarillaExperimental
          ? etapaActiva
            ? 'requiere 10 dias de datos horarios'
            : 'fuera de ventana'
          : estadoCalculo === 'calculado'
            ? this.nivelRiesgo(ultimo)
            : 'fuera de ventana',
        prescripcion: esRoyaAmarillaExperimental
          ? undefined
          : enfermedad.prescripcion,
        prescripcionAutomatica: false,
        etapaActiva,
        susceptibilidad: this.round(kVar, 2),
        factorSusceptibilidad: this.round(kVar, 2),
        resistenciaEstado: perfilVarietal.estado,
        resistenciaPerfil: perfilVarietal.perfil,
        resistenciaConfianza: perfilVarietal.confianza,
        resistenciaFuente: perfilVarietal.fuente,
        resistenciaCampania: perfilVarietal.campaniaFuente,
        resistenciaCoherente: perfilVarietal.coherente,
        resistenciaLimitaciones: perfilVarietal.limitaciones,
        resistenciaEscenarioManual: perfilVarietal.escenarioManual,
        resistenciaAlertable: false,
        resistenciaUsada,
        calidadInput: esRoyaAmarillaExperimental
          ? 'sin_datos: el escenario manual diario no reemplaza 240 horas reales'
          : 'media',
        validacion,
        salidaOperativa: !esRoyaAmarillaExperimental,
        incluirEnRanking: !esRoyaAmarillaExperimental,
        visible: true,
        simulable: true,
        alertable: false,
        nombreVisible: esRoyaAmarillaExperimental
          ? 'Roya Amarilla/Estriada (registro legado; experimental)'
          : enfermedad.nombre,
        fuenteFormula: enfermedad.formulaFuente,
        resolucion: esRoyaAmarillaExperimental ? 'horaria' : 'diaria',
        coberturaHoraria10d: esRoyaAmarillaExperimental ? 0 : undefined,
        limitaciones: esRoyaAmarillaExperimental
          ? [
              'El simulador manual diario no calcula la oportunidad ambiental horaria.',
              'Se requieren al menos 216 de 240 horas validas (90% de cobertura).',
              'La ventana movil de 10 dias requiere validacion regional argentina.',
              'La formula contractual se reproduce solo como contraste en sombra; no es una formula publicada ni una salida de enfermedad.',
            ]
          : perfilVarietal.limitaciones,
        variables: {
          DPr: this.round(DPr, 2),
          DPrHRT: this.round(DPrHRT, 2),
          DHR: this.round(DHR, 2),
          GD: this.round(GD, 2),
          DL: this.round(DL, 2),
          PMoj: this.round(PMoj, 2),
          GDN: this.round(GDN, 2),
          GDAcum: this.round(GDAcum, 2),
          resultadoCrudo: this.round(resultadoCrudo, 4),
          resultadoContractualCrudo: esRoyaAmarillaExperimental
            ? this.round(resultadoContractualCrudo, 4)
            : undefined,
          resultadoContractualLimitado: esRoyaAmarillaExperimental
            ? this.round(resultadoContractualLimitado, 2)
            : undefined,
          horasEsperadas10d: esRoyaAmarillaExperimental ? 240 : undefined,
          horasValidas10d: esRoyaAmarillaExperimental ? 0 : undefined,
          frecuenciaAmbientalPct: esRoyaAmarillaExperimental ? 0 : undefined,
          prioridadInterna: esRoyaAmarillaExperimental ? 0 : undefined,
          factorSusceptibilidad: this.round(kVar, 2),
          formulaVersion: TRIGO_MOTOR_SANITARIO_VERSION,
        },
      };
    });

    const enfermedadesOperativas = enfermedades.filter(
      (item) => item.incluirEnRanking,
    );
    const maxRiesgo = Math.max(
      ...enfermedadesOperativas.map((item) => item.riesgo),
      0,
    );
    const mayor = enfermedadesOperativas.find(
      (item) => item.riesgo === maxRiesgo,
    );
    const serie = mayor ? seriePorEnfermedad[mayor.nombre] || [] : [];

    return {
      motor: `enfermedades-trigo-v${TRIGO_MOTOR_SANITARIO_VERSION}`,
      resumen: `${params.cultivo} ${params.variedad}: ${this.nivelRiesgo(maxRiesgo)} (${this.round(maxRiesgo, 1)}%)`,
      metricas: {
        cultivo: params.cultivo,
        variedad: params.variedad,
        etapa: params.etapa,
        zona: params.zona,
        humedadRelativa: params.humedad,
        horasMojado: params.horasMojado,
        lluvia48h: params.lluvia48,
        lluviaDiariaUsada: this.round(lluviaDiaria, 1),
        temperatura: params.temperatura,
        diasSimulados: dias,
        calidadInput:
          'media: banco manual/diario; en produccion toma clima historico de estacion cercana con fallback',
        fuenteVarietal: params.resistenciasVarietales.length
          ? 'semilla.resistencia'
          : 'sensibilidad base manual',
        validacion: 'operativo_provisional',
        alertable: false,
        enfermedadPrioritaria: mayor?.nombre,
      },
      enfermedades,
      serie,
      trazas: [
        `Trigo v${TRIGO_MOTOR_SANITARIO_VERSION}: contrato funcional sanitario vigente; no mezcla acumuladores de versiones anteriores.`,
        'Ventana foliar: comenzar a contar entre 800 y 850 GDD base 0 C desde siembra (fin de macollaje); en el simulador la etapa seleccionada se considera observada.',
        'Mancha Amarilla: CInf=-2.25+1.62*DPrHRT+1.30*DPr, ponderado por susceptibilidad varietal.',
        'Mancha de la Hoja: CInf=-6.41+0.59*DHR+2.79*DPr, ponderado por susceptibilidad varietal.',
        'Roya de la Hoja: Sev%=4.42+0.61*GD+0.57*DHR-30.01*(1-factorSusceptibilidad). Factor S=1, MS=0.75, MR=0.5, R=0.05.',
        'Roya Amarilla/Estriada (ID legado Roya Anaranjada): El Jarroudi 2017 (DOI 10.1094/PDIS-12-16-1766-RE), rachas >=4 h con 4<T<16 C, HR>92% y lluvia<=0.1 mm; ventana movil 10 dias y umbrales ambientales 5/15/20%. Requiere 90% de cobertura horaria; no es diagnostico ni genera alerta.',
        'Contraste contractual en sombra: 5.15+0.72*GD+0.48*DHR+0.35*DL-35.2*(1-factorSusceptibilidad). Se reproduce exactamente, pero no se presenta como formula publicada, riesgo o porcentaje de enfermedad.',
        `Fusarium de la Espiga: I%=20.37+8.63*PMoj-0.49*GDN estima incidencia meteorologica; el ajuste varietal de Chaman no se publica como severidad. Contar desde Antesis/primeras espigas con anteras hasta ${TRIGO_FUSARIUM_GDD_BASE_0_MAX} GDD base 0 C; al alcanzar el tope se conserva el ultimo calculo y el dia siguiente queda fuera de ventana.`,
        'resultadoCrudo conserva la salida algebraica para auditoria; riesgo es la salida visible limitada al rango 0-100.',
        'Gobernanza v4: los modelos no experimentales son operativo_provisional y simulables, pero no alertables ni prescriptivos automaticamente; la Roya Amarilla/Estriada experimental queda fuera del ranking y sin prescripcion.',
        params.resistenciasVarietales.length
          ? `Perfil varietal tomado de semilla.resistencia (${params.resistenciasVarietales.length} registro(s)).`
          : 'Sin resistencia varietal especifica: el escenario manual queda identificado como no alertable y no equivale a un dato observado.',
      ],
    };
  }

  private simularEnfermedadesCebada(params: {
    cultivo: string;
    variedad: string;
    etapa: string;
    zona: string;
    humedad: number;
    horasMojado: number;
    lluvia48: number;
    temperatura: number;
    susceptibilidad: number;
    resistenciasVarietales: ResistenciaSimulador[];
    diasSimulados: number;
  }) {
    const dias = Math.max(
      1,
      Math.min(60, Math.round(params.diasSimulados || 10)),
    );
    const lluviaDiaria = Math.max(0, params.lluvia48 / 2);
    const tmin = params.temperatura - 4;
    const tmax = params.temperatura + 5;
    const enfermedadesBase = this.getEnfermedadesCultivo('Cebada');
    const seriePorEnfermedad: Record<
      string,
      Array<{ label: string; value: number }>
    > = {};
    const enfermedades = enfermedadesBase.map((enfermedad) => {
      const etapaActiva = enfermedad.etapas.some(
        (item) => item.toLowerCase() === String(params.etapa).toLowerCase(),
      );
      const perfilVarietal = this.getPerfilVarietal(
        enfermedad.nombre,
        params.susceptibilidad,
        params.resistenciasVarietales,
      );
      const kVar = perfilVarietal.multiplicador;
      let riesgo = 0;
      let GD = 0;
      let DHR = 0;
      let PMoj = 0;
      let GDN = 0;
      let GDAcum = 0;
      const serie = Array.from({ length: dias }).map((_, index) => {
        const label = `Dia ${index + 1}`;
        if (!etapaActiva) {
          return { label, value: 0 };
        }
        if (enfermedad.nombre === 'Mancha en Red') {
          const tasa = tasaDiariaManchaRedHoraria(
            Array.from({ length: 24 }, () => ({
              temperatura: params.temperatura,
              humedadRelativa: params.humedad,
            })),
            kVar,
          );
          riesgo = acumularSeveridadManchaRed(riesgo, tasa);
        } else if (enfermedad.nombre === 'Escaldadura de la Cebada') {
          riesgo = calcularEscaldadura(
            params.temperatura,
            params.horasMojado,
            lluviaDiaria,
            kVar,
          );
        } else if (enfermedad.nombre === 'Roya de la Hoja de Cebada') {
          GD += gradosDiaRoya(params.humedad, params.temperatura);
          DHR += lluviaDiaria <= 0.2 && params.humedad >= 70 ? 1 : 0;
          riesgo = calcularRoyaHoja(GD, DHR, perfilVarietal.indiceResistencia);
        } else if (enfermedad.nombre === 'Fusariosis de la Espiga de Cebada') {
          GDAcum += params.temperatura;
          PMoj += lluviaDiaria >= 0.2 && params.humedad >= 78 ? 1 : 0;
          GDN += Math.max(tmax - 26, 0) + Math.max(9 - tmin, 0);
          riesgo = calcularFusariumEspiga(PMoj, GDN, kVar, GDAcum < 530);
        }
        return { label, value: this.round(riesgo, 1) };
      });
      seriePorEnfermedad[enfermedad.nombre] = serie;
      const ultimo = serie[serie.length - 1]?.value || 0;
      return {
        nombre: enfermedad.nombre,
        periodo: enfermedad.periodo,
        riesgo: this.round(ultimo, 1),
        nivel: etapaActiva ? this.nivelRiesgo(ultimo) : 'fuera de ventana',
        prescripcion: enfermedad.prescripcion,
        etapaActiva,
        susceptibilidad: this.round(kVar, 2),
        resistenciaEstado: perfilVarietal.estado,
        resistenciaFuente: perfilVarietal.fuente,
        resistenciaCampania: perfilVarietal.campaniaFuente,
        calidadInput: 'media',
        fuenteFormula:
          enfermedad.formulaFuente || 'ENFERMEDADES EN CEBADA.xlsx',
      };
    });
    const maxRiesgo = Math.max(...enfermedades.map((item) => item.riesgo), 0);
    const mayor = enfermedades.find((item) => item.riesgo === maxRiesgo);
    const serie = mayor ? seriePorEnfermedad[mayor.nombre] || [] : [];

    return {
      motor: 'enfermedades-cebada-v2',
      resumen: `${params.cultivo} ${params.variedad}: ${this.nivelRiesgo(maxRiesgo)} (${this.round(maxRiesgo, 1)}%)`,
      metricas: {
        cultivo: params.cultivo,
        variedad: params.variedad,
        etapa: params.etapa,
        zona: params.zona,
        humedadRelativa: params.humedad,
        horasMojado: params.horasMojado,
        lluvia48h: params.lluvia48,
        lluviaDiariaUsada: this.round(lluviaDiaria, 1),
        temperatura: params.temperatura,
        diasSimulados: dias,
        calidadInput:
          'media: sin sensor horario de canopeo, usa proxy diario/manual',
        fuenteVarietal: params.resistenciasVarietales.length
          ? 'semilla.resistencia'
          : 'sensibilidad base manual',
      },
      enfermedades,
      serie,
      trazas: [
        'Cebada V2 toma formulas del Excel ENFERMEDADES EN CEBADA.xlsx.',
        'Mancha en Red: F_Temp=(T-5)*(30-T)/150, F_Hum por HR >=90/80 y acumulacion logistica diaria.',
        'Escaldadura: RI=f(T) trapezoidal x f(HMF) x f(PP) x Kvar.',
        'Roya de la Hoja de Cebada: Sev%=4.42+0.61*GD+0.57*DHR-30.01*IR.',
        'Fusariosis de la Espiga de Cebada: I%=20.37+8.63*PMoj-0.49*GDN, ponderado por perfil varietal.',
        params.resistenciasVarietales.length
          ? `Perfil varietal tomado de semilla.resistencia (${params.resistenciasVarietales.length} registro(s)).`
          : 'Sin resistencia varietal especifica: el banco usa sensibilidad manual y marca calidad varietal media.',
      ],
    };
  }

  private simularEnfermedadesMaiz(params: {
    cultivo: string;
    variedad: string;
    etapa: string;
    zona: string;
    humedad: number;
    lluvia48: number;
    temperatura: number;
    susceptibilidad: number;
    resistenciasVarietales: ResistenciaSimulador[];
    diasSimulados: number;
  }) {
    const dias = Math.max(
      1,
      Math.min(90, Math.round(params.diasSimulados || 10)),
    );
    const lluviaDiaria = Math.max(0, params.lluvia48 / 2);
    const perfilVarietal = this.getPerfilVarietal(
      'Roya del Maiz',
      params.susceptibilidad,
      params.resistenciasVarietales,
    );
    const kVar = perfilVarietal.multiplicador;
    const ir = perfilVarietal.indiceResistencia;
    let GD = 0;
    let DHR = 0;
    const etapaActiva = ['EMERGENCIA', 'FLORACION', 'VT', 'R1'].includes(
      this.norm(params.etapa),
    );
    const serie = Array.from({ length: dias }).map((_, index) => {
      if (!etapaActiva) return { label: `Dia ${index + 1}`, value: 0 };
      GD += gradosDiaRoyaMaiz(params.humedad, params.temperatura);
      DHR += lluviaDiaria <= 0.2 && params.humedad >= 95 ? 1 : 0;
      return {
        label: `Dia ${index + 1}`,
        value: this.round(calcularRoyaHoja(GD, DHR, ir), 1),
      };
    });
    const riesgo = serie[serie.length - 1]?.value || 0;
    return {
      motor: 'enfermedades-canonico-v3',
      resumen: `${params.cultivo} ${params.variedad}: ${this.nivelRiesgo(riesgo)} (${riesgo}%)`,
      metricas: {
        cultivo: params.cultivo,
        variedad: params.variedad,
        etapa: params.etapa,
        zona: params.zona,
        humedadRelativa: params.humedad,
        lluviaDiariaUsada: this.round(lluviaDiaria, 1),
        temperatura: params.temperatura,
        diasSimulados: dias,
        GD: this.round(GD, 2),
        DHR,
        indiceResistencia: this.round(ir, 2),
      },
      enfermedades: [
        {
          nombre: 'Roya del Maiz',
          idEnfermedad: 'maiz.roya',
          riesgo,
          nivel: etapaActiva ? this.nivelRiesgo(riesgo) : 'fuera de ventana',
          etapaActiva,
          susceptibilidad: this.round(kVar, 2),
          resistenciaEstado: perfilVarietal.estado,
          resistenciaFuente: perfilVarietal.fuente,
          resistenciaCampania: perfilVarietal.campaniaFuente,
          fuenteFormula: 'Núcleo compartido con sdc-api-predicciones',
        },
        {
          nombre: 'Tizon Foliar del Maiz',
          idEnfermedad: 'maiz.tizon_foliar',
          riesgo: 0,
          nivel: 'sin modelo científico validado',
          etapaActiva: false,
          fuenteFormula:
            'BASE CARGA MAIZ.xlsx aporta resistencia, no fórmula epidemiológica',
        },
      ],
      serie,
      trazas: [
        'Roya del Maiz usa exactamente la misma función canónica que producción.',
        'Tizón foliar se declara sin modelo; no se fabrica un porcentaje con una fórmula genérica.',
      ],
    };
  }

  private simularEnfermedadesSoja(params: {
    cultivo: string;
    variedad: string;
    etapa: string;
    zona: string;
    lluvia48: number;
    susceptibilidad: number;
    resistenciasVarietales: ResistenciaSimulador[];
    diasSimulados: number;
  }) {
    const dias = Math.max(
      1,
      Math.min(90, Math.round(params.diasSimulados || 10)),
    );
    const lluviaDiaria = Math.max(0, params.lluvia48 / 2);
    const perfilVarietal = this.getPerfilVarietal(
      'Fin de Ciclo',
      params.susceptibilidad,
      params.resistenciasVarietales,
    );
    const kVar = perfilVarietal.multiplicador;
    const etapaActiva = [
      'R3',
      'R5',
      'FRUCTIFICACION',
      'INICIO DE LLENADO',
    ].includes(this.norm(params.etapa));
    let PtAc7 = 0;
    let DPr7 = 0;
    let Lt7 = 0;
    const serie = Array.from({ length: dias }).map((_, index) => {
      if (etapaActiva && lluviaDiaria >= 7) {
        DPr7 += 1;
        PtAc7 += lluviaDiaria;
        Lt7 = DPr7 * PtAc7;
      }
      return {
        label: `Dia ${index + 1}`,
        value: etapaActiva ? this.round(calcularFinCicloSoja(Lt7, kVar), 1) : 0,
      };
    });
    const riesgo = serie[serie.length - 1]?.value || 0;
    return {
      motor: 'enfermedades-canonico-v3',
      resumen: `${params.cultivo} ${params.variedad}: ${this.nivelRiesgo(riesgo)} (${riesgo}%)`,
      metricas: {
        cultivo: params.cultivo,
        variedad: params.variedad,
        etapa: params.etapa,
        zona: params.zona,
        lluviaDiariaUsada: this.round(lluviaDiaria, 1),
        diasSimulados: dias,
        PtAc7: this.round(PtAc7, 2),
        DPr7,
        Lt7: this.round(Lt7, 2),
      },
      enfermedades: [
        {
          nombre: 'Fin de Ciclo',
          idEnfermedad: 'soja.fin_ciclo',
          riesgo,
          nivel: etapaActiva ? this.nivelRiesgo(riesgo) : 'fuera de ventana',
          etapaActiva,
          susceptibilidad: this.round(kVar, 2),
          resistenciaEstado: perfilVarietal.estado,
          resistenciaFuente: perfilVarietal.fuente,
          resistenciaCampania: perfilVarietal.campaniaFuente,
          fuenteFormula: 'Núcleo compartido con sdc-api-predicciones',
        },
      ],
      serie,
      trazas: [
        'Fin de Ciclo usa exactamente la misma función canónica que producción.',
        'La base 2025/2026 de Soja no aporta resistencia sanitaria específica; el simulador debe mostrar ese faltante.',
      ],
    };
  }

  simularRiego(body: any) {
    const humedadActual = Number(body?.humedadSueloPct ?? 31);
    const capacidadCampo = Number(body?.capacidadCampoPct ?? 34);
    const puntoMarchitez = Number(body?.puntoMarchitezPct ?? 14);
    const profundidadCm = Number(body?.profundidadRaicesCm ?? 60);
    const et0 = Number(body?.et0MmDia ?? 4.2);
    const kc = Number(body?.kc ?? 0.9);
    const lluvia72h = Number(body?.lluvia72h ?? 4);
    const probabilidadLluvia = Number(body?.probabilidadLluviaPct ?? 55);
    const capacidadRiegoDia = Number(body?.capacidadRiegoMmDia ?? 6);
    const anchoBulboM = Number(body?.anchoBulboM ?? 1);
    const metrosLinealesHa = Number(body?.metrosLinealesHa ?? 10000);
    const umbralAguaUtil = Number(body?.umbralAguaUtilPct ?? 45);
    const raicesActivas = body?.raicesActivas !== false;

    const factorAreaMojada = this.clamp(
      (anchoBulboM * metrosLinealesHa) / 10000,
      0.05,
      1.5,
    );
    const rangoUtilPct = Math.max(capacidadCampo - puntoMarchitez, 1);
    const aguaTotalDisponibleMm =
      (rangoUtilPct / 100) * profundidadCm * 10 * factorAreaMojada;
    const aguaUtilActualMm =
      (this.clamp(humedadActual - puntoMarchitez, 0, rangoUtilPct) / 100) *
      profundidadCm *
      10 *
      factorAreaMojada;
    const aguaUtilPct = this.clamp(
      (aguaUtilActualMm / Math.max(aguaTotalDisponibleMm, 1)) * 100,
      0,
      100,
    );
    const deficitMm =
      (this.clamp(capacidadCampo - humedadActual, 0, capacidadCampo) / 100) *
      profundidadCm *
      10 *
      factorAreaMojada;
    const etcDia = et0 * kc;
    const demanda72h = etcDia * 3;
    const lluviaEfectiva72h = probabilidadLluvia >= 70 ? lluvia72h * 0.8 : 0;
    const saldo72h = aguaUtilActualMm + lluviaEfectiva72h - demanda72h;
    const umbralMm = (aguaTotalDisponibleMm * umbralAguaUtil) / 100;
    const recomendacionMm =
      raicesActivas && saldo72h < umbralMm
        ? this.round(
            Math.min(
              Math.max(deficitMm - lluviaEfectiva72h, 0),
              capacidadRiegoDia,
            ),
            1,
          )
        : 0;
    const decision = !raicesActivas
      ? 'No recomendar: falta confirmar raíces activas en la zona medida'
      : recomendacionMm > 0
        ? `Regar ${recomendacionMm} mm`
        : 'No regar por ahora';
    let humedad = humedadActual;
    const serie = Array.from({ length: 7 }).map((_, index) => {
      const lluviaDia = index < 3 ? lluviaEfectiva72h / 3 : 0;
      humedad = this.clamp(
        humedad +
          (lluviaDia / (profundidadCm * 10)) * 100 -
          (etcDia / (profundidadCm * 10)) * 100,
        puntoMarchitez,
        capacidadCampo,
      );
      const aguaUtil = this.clamp(
        ((humedad - puntoMarchitez) / rangoUtilPct) * 100,
        0,
        100,
      );
      return { label: `Dia ${index + 1}`, value: this.round(aguaUtil, 1) };
    });

    return {
      motor: 'riego',
      resumen: decision,
      metricas: {
        humedadActual,
        capacidadCampo,
        puntoMarchitez,
        aguaUtilPct: this.round(aguaUtilPct, 1),
        aguaUtilActualMm: this.round(aguaUtilActualMm, 1),
        aguaTotalDisponibleMm: this.round(aguaTotalDisponibleMm, 1),
        deficitMm: this.round(deficitMm, 1),
        etcDia: this.round(etcDia, 1),
        demanda72h: this.round(demanda72h, 1),
        lluviaEfectiva72h: this.round(lluviaEfectiva72h, 1),
        balance72h: this.round(saldo72h, 1),
        recomendacionMm,
        capacidadRiegoDia,
        raicesActivas,
      },
      serie,
      trazas: [
        'Agua util = (humedad actual - PMP) / (capacidad de campo - PMP).',
        'Deficit mm = diferencia a capacidad de campo por profundidad efectiva, bulbo mojado y metros lineales por hectarea.',
        `ETc diaria = ET0 ${et0} x Kc ${kc} = ${this.round(etcDia, 1)} mm/dia.`,
        `Lluvia efectiva 72 h = ${probabilidadLluvia >= 70 ? 'lluvia x 0.8' : '0 por baja probabilidad'} = ${this.round(lluviaEfectiva72h, 1)} mm.`,
        'La recomendacion se limita por capacidad diaria de riego y exige raices activas detectadas/cargadas.',
      ],
    };
  }

  simularMalezas(body: any) {
    const cultivo = body?.cultivo || 'Trigo';
    const especie = body?.especie || 'Amaranthus';
    const dias = Number(body?.dias ?? 20);
    const temperaturaMedia = Number(body?.temperaturaMedia ?? 17);
    const baseTermica = Number(body?.baseTermica ?? 8);
    const humedadSuelo = Number(body?.humedadSueloPct ?? 55);
    const lluvia7d = Number(body?.lluvia7d ?? 18);
    const k = Number(body?.k ?? 0.038);
    const x0 = Number(body?.x0 ?? 130);
    const amplitud = Number(body?.amplitud ?? 92);

    const cultivosPermitidos = ['Trigo', 'Soja', 'Maiz'];
    const habilitado = cultivosPermitidos.includes(cultivo);
    let gradosDia = 0;
    const humedadFactor = this.clamp(
      (humedadSuelo + lluvia7d) / 100,
      0.25,
      1.25,
    );
    const serie = Array.from({ length: dias }).map((_, index) => {
      gradosDia += Math.max(temperaturaMedia - baseTermica, 0) * humedadFactor;
      const emergencia = habilitado
        ? amplitud * Math.exp(-Math.exp(-k * (gradosDia - x0)))
        : 0;
      return {
        label: `Dia ${index + 1}`,
        value: this.round(this.clamp(emergencia, 0, 100), 1),
      };
    });
    const ultimo = serie[serie.length - 1]?.value || 0;

    return {
      motor: 'malezas',
      resumen: habilitado
        ? `${especie}: emergencia acumulada ${this.round(ultimo, 1)}%`
        : `No aplica para ${cultivo}; malezas solo se habilita en trigo, soja y maiz.`,
      metricas: {
        cultivo,
        especie,
        gradosDia: this.round(gradosDia, 1),
        temperaturaMedia,
        humedadSuelo,
        lluvia7d,
        habilitado,
      },
      serie,
      trazas: [
        'Curva Gompertz: emergencia = A x exp(-exp(-k x (grados dia - x0))).',
        'Los grados dia se ajustan por humedad de suelo y lluvia reciente.',
        habilitado
          ? 'Motor habilitado para trigo, soja y maiz.'
          : `Cultivo ${cultivo} fuera del alcance operativo del motor de malezas.`,
      ],
    };
  }

  async calcularHuellaHidricaReal(
    params: Omit<HuellaHidricaParams, 'clima'>,
  ): Promise<HuellaHidricaResultado> {
    const lote = params.lote;
    const siembra = params.siembra;
    const lat = lote.ubicacion?.centro?.lat;
    const lng = lote.ubicacion?.centro?.lng;
    if (lat == null || lng == null) {
      throw new BadRequestException(
        'No se puede calcular huella hidrica: el lote no tiene centro geografico.',
      );
    }
    if (!siembra.fechaSiembra || !siembra.fechaCosecha) {
      throw new BadRequestException(
        'No se puede calcular huella hidrica: faltan fechas de siembra o cosecha.',
      );
    }
    const clima = await this.getClimaOpenMeteo(
      lat,
      lng,
      siembra.fechaSiembra,
      siembra.fechaCosecha,
    );
    return calcularHuellaHidrica({ ...params, clima });
  }

  async calcularSeguimientoHuellaHidrica(
    params: Omit<HuellaHidricaParams, 'clima'>,
  ): Promise<HuellaHidricaSeguimientoResultado> {
    const lote = params.lote;
    const siembra = params.siembra;
    const lat = lote.ubicacion?.centro?.lat;
    const lng = lote.ubicacion?.centro?.lng;
    if (lat == null || lng == null) {
      return calcularSeguimientoHuellaHidrica({ ...params, clima: [] });
    }
    if (!siembra.fechaSiembra) {
      return calcularSeguimientoHuellaHidrica({ ...params, clima: [] });
    }

    const desde = this.toDateKey(siembra.fechaSiembra);
    const hoy = this.toDateKey(new Date().toISOString());
    const hasta = siembra.fechaCosecha
      ? this.toDateKey(siembra.fechaCosecha)
      : hoy;
    const fechaHasta = desde > hasta ? desde : hasta;
    try {
      const clima = await this.getClimaOpenMeteo(lat, lng, desde, fechaHasta);
      return calcularSeguimientoHuellaHidrica({ ...params, clima });
    } catch (error) {
      this.logger.warn(
        `Open-Meteo no disponible para seguimiento de huella; se entrega calculo parcial: ${error?.message || error}`,
      );
      return calcularSeguimientoHuellaHidrica({ ...params, clima: [] });
    }
  }

  async calcularPrediccionMalezas(params: {
    siembra: ISiembra;
    lote: ILote;
  }): Promise<IResultadoPrediccionMalezas> {
    const siembra = params.siembra;
    const lote = params.lote;
    const cultivo = siembra.semilla?.cultivo;
    const fecha = new Date().toISOString();
    const baseResultado: IResultadoPrediccionMalezas = {
      fecha,
      idSiembra: siembra._id,
      idLote: lote._id || siembra.idLote,
      cultivo,
      estado: 'operativo',
      fuenteDatos: 'Open-Meteo',
      calidadDatos: 'media',
      especies: [],
      trazas: [],
    };

    if (!cultivo || !this.cultivosMalezas.includes(cultivo)) {
      return {
        ...baseResultado,
        estado: 'no_aplica',
        resumen: `Motor de malezas habilitado para ${this.cultivosMalezas.join(', ')}.`,
        calidadDatos: 'baja',
        trazas: [`Cultivo recibido: ${cultivo || 'sin cultivo'}.`],
      };
    }

    const modelos = await this.getModelosMalezas(cultivo);
    if (!modelos.length) {
      return {
        ...baseResultado,
        estado: 'sin_modelos',
        resumen: `${cultivo}: no hay modelos de malezas cargados.`,
        calidadDatos: 'baja',
        trazas: [
          'No se encontraron documentos en la coleccion malezas para el cultivo.',
        ],
      };
    }

    const centro = this.getCentroLote(lote, siembra);
    if (!centro) {
      return {
        ...baseResultado,
        estado: 'sin_clima',
        resumen: `${cultivo}: falta centro geografico del lote para consultar clima.`,
        calidadDatos: 'baja',
        trazas: [
          'No se pudo resolver lat/lng desde lote.ubicacion.centro ni siembra.coordenadas.',
        ],
      };
    }

    const hoy = this.toDateKey(new Date().toISOString());
    const ayer = this.shiftDateKey(hoy, -1);
    const hastaPronostico = this.shiftDateKey(
      hoy,
      this.diasPronosticoMalezas - 1,
    );
    const fechaSiembra = this.toDateKey(siembra.fechaSiembra || hoy);
    const desdeMaximo = this.shiftDateKey(hoy, -this.maxDiasHistoricoMalezas);
    const desde = fechaSiembra > desdeMaximo ? fechaSiembra : desdeMaximo;
    const recorteDias =
      fechaSiembra < desde ? this.diffDias(fechaSiembra, desde) : 0;

    let clima: DiaClimaMalezas[] = [];
    try {
      clima = await this.getClimaMalezasOpenMeteo(
        centro.lat,
        centro.lng,
        desde,
        hastaPronostico,
      );
    } catch (error) {
      this.logger.error(`Error al calcular malezas ${siembra._id}: ${error}`);
      return {
        ...baseResultado,
        estado: 'sin_clima',
        resumen: `${cultivo}: no se pudo obtener clima historico/proyectado.`,
        calidadDatos: 'baja',
        trazas: [
          'Open-Meteo no respondio para la ventana de malezas. No se actualizo la prediccion persistida.',
        ],
      };
    }

    if (!clima.length) {
      return {
        ...baseResultado,
        estado: 'sin_clima',
        resumen: `${cultivo}: sin dias climaticos disponibles para evaluar malezas.`,
        calidadDatos: 'baja',
        periodo: {
          desde,
          hastaHistorico: ayer,
          hastaPronostico,
          diasHistorico: 0,
          diasPronostico: 0,
          diasEvaluados: 0,
          recorteDias,
        },
        trazas: ['La consulta climatica no devolvio dias utiles.'],
      };
    }

    const sensor = this.getSensorSueloReferencia(lote);
    const especies = modelos.map((maleza) =>
      this.evaluarMaleza(maleza, clima, sensor),
    );
    const mayor = [...especies].sort(
      (a, b) => Number(b.avancePct || 0) - Number(a.avancePct || 0),
    )[0];
    const diasHistorico = clima.filter(
      (dia) => dia.tipo === 'historico',
    ).length;
    const diasPronostico = clima.filter(
      (dia) => dia.tipo === 'pronostico',
    ).length;
    const calidadDatos = this.calidadPrediccionMalezas(
      sensor,
      diasHistorico,
      diasPronostico,
    );

    return {
      ...baseResultado,
      resumen: mayor
        ? `${cultivo}: mayor avance en ${mayor.nombre || 'maleza'} (${this.round(mayor.avancePct || 0, 1)}%).`
        : `${cultivo}: sin especies evaluadas.`,
      fuenteDatos:
        sensor.temperatura !== undefined || sensor.humedad !== undefined
          ? 'Open-Meteo + sensor de suelo'
          : 'Open-Meteo historico/proyectado',
      calidadDatos,
      periodo: {
        desde,
        hastaHistorico: ayer,
        hastaPronostico,
        diasHistorico,
        diasPronostico,
        diasEvaluados: clima.length,
        recorteDias,
      },
      especies,
      trazas: [
        'HTT diario = max(0, temperatura media - base termica) x factor hidrico x delta horas.',
        'Factor hidrico = 1 / (1 + exp((theta50 - humedad) / escala)).',
        'Emergencia Gompertz = K x exp(-exp(-beta x (HTT acumulado - mu))).',
        recorteDias > 0
          ? `La siembra excedia la ventana operativa; se recortaron ${recorteDias} dias iniciales y se evaluo desde ${desde}.`
          : `Acumulacion desde fecha de siembra: ${desde}.`,
      ],
    };
  }

  calcularHumedadSeca(
    rendimientoKgHa?: number,
    humedadCosecha?: number,
  ): number {
    const rendimiento = Number(rendimientoKgHa || 0);
    const humedad = Number(humedadCosecha || 0);
    if (rendimiento <= 0) return 0;
    return Math.round(rendimiento * (100 / (100 + humedad)) * 100) / 100;
  }

  private async getModelosMalezas(cultivo: string): Promise<IMaleza[]> {
    const response = await this.malezasService.getFilter({
      filter: JSON.stringify({ cultivosObjetivo: cultivo }),
      sort: 'nombre',
    });
    return response.datos || [];
  }

  private evaluarMaleza(
    maleza: IMaleza,
    clima: DiaClimaMalezas[],
    sensor: SensorSueloReferencia,
  ): IPrediccionMalezaEspecie {
    const parametros = maleza.parametros || {};
    const base = Number(parametros.temperaturaBase ?? 0);
    const deltaHoras = Number(parametros.deltaHoras ?? 24);
    const theta50 = Number(parametros.humedadTheta50 ?? 0.2);
    const escala = Number(parametros.humedadEscala ?? 0.03);
    const k = Number(parametros.kMaxPorcentaje ?? 100);
    const beta = Number(parametros.beta ?? 0);
    const mu = Number(parametros.muHorasTermicas ?? 0);
    let httAcumulado = 0;
    let httHistorico = 0;
    let httProyectado7d = 0;

    const serie: IPrediccionMalezaDia[] = clima.map((dia) => {
      const usarSensor = dia.tipo === 'pronostico';
      const temperatura =
        usarSensor && sensor.temperatura !== undefined
          ? sensor.temperatura
          : (this.toNumber(dia.temperaturaMedia) ?? 0);
      const humedad =
        usarSensor && sensor.humedad !== undefined
          ? sensor.humedad
          : this.humedadProxyMalezas(dia);
      const factorTermico = Math.max(0, temperatura - base);
      const factorHidrico = 1 / (1 + Math.exp((theta50 - humedad) / escala));
      const httDia = factorTermico * factorHidrico * deltaHoras;
      httAcumulado += httDia;

      if (dia.tipo === 'historico') {
        httHistorico += httDia;
      } else {
        httProyectado7d += httDia;
      }

      return {
        fecha: dia.fecha,
        tipo: dia.tipo,
        temperaturaMedia: this.round(temperatura, 1),
        lluviaMm: this.round(dia.lluviaMm || 0, 1),
        et0Mm: this.round(dia.et0Mm || 0, 1),
        humedadSueloPct: this.round(humedad * 100, 0),
        factorHidrico: this.round(factorHidrico, 3),
        httDia: this.round(httDia, 1),
        httAcumulado: this.round(httAcumulado, 1),
        emergenciaPct: this.gompertz(httAcumulado, k, beta, mu),
        fuente:
          usarSensor &&
          (sensor.temperatura !== undefined || sensor.humedad !== undefined)
            ? 'Open-Meteo + sensor'
            : 'Open-Meteo',
      };
    });

    const emergenciaActualPct = this.gompertz(httHistorico, k, beta, mu);
    const emergenciaProyectada7dPct = this.gompertz(httAcumulado, k, beta, mu);
    const umbrales = this.analizarUmbralesMaleza(maleza, serie, httAcumulado);
    const progresoE10 = umbrales[0]?.progreso || 0;
    const avancePct = this.porcentaje(
      Math.max(emergenciaProyectada7dPct, progresoE10),
    );
    const severidad = this.severidadMalezas(
      avancePct,
      emergenciaProyectada7dPct,
    );
    const calidadDatos = this.calidadPrediccionMalezas(
      sensor,
      clima.filter((dia) => dia.tipo === 'historico').length,
      clima.filter((dia) => dia.tipo === 'pronostico').length,
    );

    return {
      idMaleza: String(maleza._id || ''),
      codigoCarga: maleza.codigoCarga,
      nombre: maleza.nombre,
      nombreCientifico: maleza.nombreCientifico,
      modelo: maleza.modelo || 'Gompertz HTT',
      avancePct,
      emergenciaPct: emergenciaProyectada7dPct,
      emergenciaActualPct,
      emergenciaProyectada7dPct,
      httHistorico: this.round(httHistorico, 1),
      httProyectado7d: this.round(httProyectado7d, 1),
      httTotal: this.round(httAcumulado, 1),
      temperaturaReferencia: sensor.temperatura,
      humedadReferencia: sensor.humedad,
      severidad,
      estado:
        severidad === 'alta'
          ? 'Ventana de control'
          : severidad === 'media'
            ? 'Monitoreo cercano'
            : 'Baja emergencia',
      estadoCorto:
        severidad === 'alta'
          ? 'Avance alto'
          : severidad === 'media'
            ? 'Avance medio'
            : 'Avance bajo',
      lecturaCorta: this.lecturaCortaMalezas(
        severidad,
        emergenciaActualPct,
        emergenciaProyectada7dPct,
        progresoE10,
      ),
      recomendacion: this.recomendacionMaleza(severidad, maleza),
      fuenteDatos:
        sensor.temperatura !== undefined || sensor.humedad !== undefined
          ? 'Open-Meteo + sensor de suelo'
          : 'Open-Meteo historico/proyectado',
      detalleFuente: this.detalleFuenteMalezas(sensor, clima.length),
      formula: `Emergencia = K x exp(-exp(-beta x (HTT - mu))). K=${k || '-'}, beta=${beta || '-'}, mu=${mu || '-'} HTT.`,
      calidadDatos,
      temperaturaBase: base,
      deltaHoras,
      umbrales,
      recomendaciones: maleza.recomendaciones || [],
      observaciones: maleza.observaciones,
      serie,
    };
  }

  private analizarUmbralesMaleza(
    maleza: IMaleza,
    serie: IPrediccionMalezaDia[],
    httTotal: number,
  ): IPrediccionMalezaUmbral[] {
    return [...(maleza.umbrales || [])]
      .sort((a, b) => Number(a.porcentaje || 0) - Number(b.porcentaje || 0))
      .map((umbral) => {
        const horasTermicas = Number(umbral.horasTermicas || 0);
        const progreso = horasTermicas
          ? this.porcentaje((httTotal / horasTermicas) * 100)
          : 0;
        const alcanzado = serie.find(
          (dia) => Number(dia.httAcumulado || 0) >= horasTermicas,
        );
        const estimacion = alcanzado
          ? { fechaEstimada: alcanzado.fecha, diasEstimados: 0 }
          : this.estimarFechaUmbral(serie, horasTermicas, httTotal);

        return {
          porcentaje: umbral.porcentaje,
          horasTermicas,
          progreso: this.round(progreso, 0),
          estado:
            progreso >= 100
              ? 'alcanzado'
              : progreso >= 65
                ? 'cercano'
                : 'en seguimiento',
          ...estimacion,
        };
      });
  }

  private estimarFechaUmbral(
    serie: IPrediccionMalezaDia[],
    horasTermicas: number,
    httTotal: number,
  ): { fechaEstimada?: string; diasEstimados?: number } {
    if (!horasTermicas || httTotal >= horasTermicas || !serie.length) return {};
    const ultimos = serie
      .slice(-7)
      .map((dia) => Number(dia.httDia || 0))
      .filter((value) => value > 0);
    const promedio = ultimos.length
      ? ultimos.reduce((sum, value) => sum + value, 0) / ultimos.length
      : 0;
    if (promedio <= 0) return {};
    const diasEstimados = Math.ceil((horasTermicas - httTotal) / promedio);
    const ultimaFecha = serie[serie.length - 1]?.fecha;
    return {
      diasEstimados,
      fechaEstimada: ultimaFecha
        ? this.shiftDateKey(ultimaFecha, diasEstimados)
        : undefined,
    };
  }

  private severidadMalezas(
    avancePct: number,
    emergenciaPct: number,
  ): TSeveridadPrediccionMaleza {
    if (emergenciaPct >= 10 || avancePct >= 100) return 'alta';
    if (emergenciaPct >= 5 || avancePct >= 65) return 'media';
    return 'baja';
  }

  private lecturaCortaMalezas(
    severidad: TSeveridadPrediccionMaleza,
    emergenciaActualPct: number,
    emergenciaProyectadaPct: number,
    progresoE10: number,
  ): string {
    if (severidad === 'alta') {
      return `Control temprano: E10 al ${this.round(progresoE10, 0)}%.`;
    }
    if (severidad === 'media') {
      return `Monitorear nacimientos: sube de ${this.round(emergenciaActualPct, 1)}% a ${this.round(emergenciaProyectadaPct, 1)}%.`;
    }
    return `Emergencia baja: ${this.round(emergenciaProyectadaPct, 1)}% proyectado.`;
  }

  private recomendacionMaleza(
    severidad: TSeveridadPrediccionMaleza,
    maleza: IMaleza,
  ): string {
    if (severidad === 'alta') {
      return (
        maleza.recomendaciones?.find((item) => item.momento?.includes('E10'))
          ?.accion || 'Revisar lote y definir control temprano.'
      );
    }
    if (severidad === 'media') {
      return 'Entrar a monitorear nacimientos y comparar contra zonas humedas, bordes y compactaciones.';
    }
    return 'Mantener seguimiento; usar recorrida para validar nacimientos y ajustar residualidad.';
  }

  private detalleFuenteMalezas(
    sensor: SensorSueloReferencia,
    dias: number,
  ): string {
    const temp =
      sensor.temperatura !== undefined
        ? `${this.round(sensor.temperatura, 1)} C de suelo como referencia de arranque`
        : 'temperatura media diaria de Open-Meteo';
    const humedad =
      sensor.humedad !== undefined
        ? `${this.round(sensor.humedad * 100, 0)}% de humedad de suelo como referencia de arranque`
        : 'proxy hidrico diario por lluvia y ET0';
    return `Acumula ${dias} dias con ${temp} y ${humedad}.`;
  }

  private calidadPrediccionMalezas(
    sensor: SensorSueloReferencia,
    diasHistorico: number,
    diasPronostico: number,
  ): TCalidadPrediccionMalezas {
    const tieneSensorCompleto =
      sensor.temperatura !== undefined && sensor.humedad !== undefined;
    if (tieneSensorCompleto && diasHistorico >= 14 && diasPronostico >= 3)
      return 'alta';
    if (diasHistorico >= 7 && diasPronostico >= 3) return 'media';
    return 'baja';
  }

  private getSensorSueloReferencia(lote: ILote): SensorSueloReferencia {
    const dispositivo = lote.dispositivos?.find(
      (item) => item.tipo === 'Sensor de Humedad de Suelo',
    );
    return {
      temperatura: this.promedioValoresSensor(dispositivo, 'Temperatura Suelo'),
      humedad: this.humedadSueloReferencia(dispositivo),
    };
  }

  private promedioValoresSensor(
    dispositivo: IDispositivo | undefined,
    sensor: string,
  ): number | undefined {
    const valores = (dispositivo?.ultimoReporte?.datos?.valores as any)?.[
      sensor
    ];
    if (!Array.isArray(valores)) return undefined;
    const numeros = valores
      .slice(0, 3)
      .map((item) =>
        this.toNumber(item?.valores?.actual ?? item?.valores?.promedio),
      )
      .filter((valor): valor is number => valor !== undefined);
    if (!numeros.length) return undefined;
    return numeros.reduce((sum, value) => sum + value, 0) / numeros.length;
  }

  private humedadSueloReferencia(
    dispositivo: IDispositivo | undefined,
  ): number | undefined {
    const valores =
      (dispositivo?.ultimoReporte?.datos?.valores as any)?.[
        'Humedad Suelo Profundidad'
      ] ||
      (dispositivo?.ultimoReporte?.datos?.valores as any)?.[
        'Humedad Suelo Superficial'
      ];
    if (!Array.isArray(valores)) return undefined;
    const numeros = valores
      .slice(0, 3)
      .map((item) =>
        this.normalizarHumedadSensor(
          this.toNumber(item?.valores?.actual ?? item?.valores?.promedio),
          item?.unidad,
        ),
      )
      .filter((valor): valor is number => valor !== undefined);
    if (!numeros.length) return undefined;
    const promedio =
      numeros.reduce((sum, value) => sum + value, 0) / numeros.length;
    return this.clamp(promedio / 100, 0, 1);
  }

  private normalizarHumedadSensor(
    value: number | undefined,
    unidad?: string,
  ): number | undefined {
    if (value === undefined) return undefined;
    const unidadNormalizada = String(unidad || '')
      .toLowerCase()
      .replace(/\s/g, '');
    if (value > 100 && value <= 300) return (value / 300) * 100;
    if (unidadNormalizada.includes('%')) return this.clamp(value, 0, 100);
    if (
      (unidadNormalizada.includes('m3/m3') ||
        unidadNormalizada.includes('vwc')) &&
      value >= 0 &&
      value <= 1
    ) {
      return value * 100;
    }
    if (value >= 0 && value <= 3) return (value / 3) * 100;
    if (value > 300 && value <= 1000) return value / 10;
    return this.clamp(value, 0, 100);
  }

  private humedadProxyMalezas(dia: DiaClimaMalezas): number {
    const lluvia = Number(dia.lluviaMm || 0);
    const et0 = Number(dia.et0Mm || 0);
    return this.clamp(0.12 + lluvia / 90 - et0 / 80, 0.05, 0.45);
  }

  private gompertz(htt: number, k: number, beta: number, mu: number): number {
    if (!k || !beta || !mu) return 0;
    return this.round(k * Math.exp(-Math.exp(-beta * (htt - mu))), 1);
  }

  private getCentroLote(
    lote: ILote,
    siembra: ISiembra,
  ): { lat: number; lng: number } | undefined {
    const centro = lote.ubicacion?.centro || siembra.coordenadas;
    const lat = this.toNumber((centro as any)?.lat);
    const lng = this.toNumber((centro as any)?.lng);
    if (lat === undefined || lng === undefined) return undefined;
    return { lat, lng };
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

  private gradosDiaRoyaAnaranjada(hr: number, tavg: number): number {
    if (hr <= 60 || tavg < 7 || tavg > 14) return 0;
    return this.round(tavg, 2);
  }

  private indiceResistenciaDesdeKVar(kVar: number): number {
    const susceptibilidad = this.clamp(Number(kVar) || 1, 0, 1);
    if (susceptibilidad <= 0.1) return 1;
    if (susceptibilidad >= 0.95) return 0;
    return this.round(1 - susceptibilidad, 2);
  }

  private simularEnfermedadesArveja(params: {
    cultivo: string;
    variedad: string;
    etapa: string;
    zona: string;
    humedad: number;
    horasMojado: number;
    lluvia48: number;
    temperatura: number;
  }) {
    const etapaNormalizada = this.norm(params.etapa);
    const etapaReproductiva = [
      'R1',
      'R3',
      'FLORACION',
      'FORMACION DE VAINAS',
    ].includes(etapaNormalizada);
    const evaluaciones = [
      {
        idEnfermedad: 'arveja.ascochyta',
        nombre: 'Complejo Ascochyta de la Arveja',
        periodo: 'Emergencia a formacion de vainas',
        etapaActiva: !['S', 'SIEMBRA', 'MF', 'MADUREZ FISIOLOGICA'].includes(
          etapaNormalizada,
        ),
        fuente:
          'Roger y Tivoli (1999); aptitud ambiental, no probabilidad de infeccion',
        evaluacion: evaluarAscochytaArveja({
          temperatura: params.temperatura,
          horasMojado: params.horasMojado,
          lluviaMm: params.lluvia48,
        }),
      },
      {
        idEnfermedad: 'arveja.mildiu',
        nombre: 'Mildiu de la Arveja',
        periodo: 'Emergencia a inicio de floracion',
        etapaActiva: ['E', 'EMERGENCIA', 'R1', 'FLORACION'].includes(
          etapaNormalizada,
        ),
        fuente: 'Pegg y Mence (1970); umbrales de infeccion y esporulacion',
        evaluacion: evaluarMildiuArveja({
          temperatura: params.temperatura,
          horasMojado: params.horasMojado,
          humedadRelativa: params.humedad,
        }),
      },
      {
        idEnfermedad: 'arveja.oidio',
        nombre: 'Oidio de la Arveja',
        periodo: 'Floracion a formacion de vainas',
        etapaActiva: etapaReproductiva,
        fuente: 'INTA Parana; prioridad de monitoreo experimental',
        evaluacion: evaluarOidioArveja({
          temperatura: params.temperatura,
          lluviaMm: params.lluvia48,
          etapaReproductiva,
        }),
      },
    ].map((item) => ({
      ...item,
      riesgo: item.etapaActiva ? item.evaluacion.indiceAmbiental : 0,
      nivel: item.etapaActiva ? item.evaluacion.nivel : 'fuera de ventana',
      fundamentos: item.evaluacion.fundamentos,
      resistenciaEstado: 'desconocida',
      resistenciaFuente:
        'Sin dato varietal publicado para la variedad seleccionada',
      prescripcion: 'No habilitada en el piloto experimental',
    }));
    const activas = evaluaciones.filter((item) => item.etapaActiva);
    const maxIndice = Math.max(...activas.map((item) => item.riesgo), 0);
    const nivel = maxIndice >= 80 ? 'alto' : maxIndice >= 50 ? 'medio' : 'bajo';

    return {
      motor: 'enfermedades-arveja-experimental',
      modo: 'screening_ambiental',
      resumen: `${params.cultivo} ${params.variedad}: aptitud ambiental ${nivel}; no equivale a infeccion confirmada.`,
      metricas: {
        cultivo: params.cultivo,
        variedad: params.variedad,
        etapa: params.etapa,
        zona: params.zona,
        humedadRelativa: params.humedad,
        horasMojado: params.horasMojado,
        lluvia48h: params.lluvia48,
        temperatura: params.temperatura,
        resistenciaVarietal: 'sin_datos',
      },
      enfermedades: evaluaciones,
      serie: [],
      trazas: [
        'Los valores 20/50/80 son indices ordinales para bajo/medio/alto; no son porcentajes de infeccion.',
        'No se generan alertas, prescripciones ni recomendaciones quimicas automaticas.',
        'La confirmacion de sintomas, inoculo, rastrojo y resistencia varietal requiere observacion de campo.',
      ],
    };
  }

  private getEnfermedadesCultivo(cultivo: string) {
    const base: Record<string, Array<Record<string, any>>> = {
      Trigo: [
        {
          nombre: 'Mancha Amarilla',
          periodo:
            'Desde 800-850 GDD base 0 C (fin de macollaje) hasta espigazon',
          etapas: ['Primer Nudo', 'Hoja bandera', 'Hoja Bandera', 'Espigazon'],
          humedadBase: 82,
          horasMojadoCriticas: 16,
          lluviaCritica: 10,
          tempOptima: 20,
          formulaFuente: 'Contrato sanitario trigo 2026 / Mancha Amarilla',
          prescripcion:
            'Triazol + estrobilurina; proteger area foliar y hoja bandera.',
        },
        {
          nombre: 'Mancha de la Hoja',
          periodo:
            'Desde 800-850 GDD base 0 C (fin de macollaje) hasta espigazon',
          etapas: ['Primer Nudo', 'Hoja bandera', 'Hoja Bandera', 'Espigazon'],
          humedadBase: 80,
          horasMojadoCriticas: 16,
          lluviaCritica: 10,
          tempOptima: 18,
          formulaFuente: 'Contrato sanitario trigo 2026 / Mancha de la Hoja',
          prescripcion:
            'Revisar septoriosis/mancha de hoja; priorizar hoja bandera y sanidad foliar.',
        },
        {
          nombre: 'Roya de la Hoja',
          periodo: 'Desde 800-850 GDD base 0 C hasta llenado de granos',
          etapas: [
            'Primer Nudo',
            'Hoja bandera',
            'Hoja Bandera',
            'Espigazon',
            'Antesis',
            'Llenado de granos',
          ],
          humedadBase: 78,
          horasMojadoCriticas: 10,
          lluviaCritica: 6,
          tempOptima: 18,
          formulaFuente:
            'Contrato sanitario trigo 2026; Moschini y Perez (1999), adaptacion varietal declarada',
          prescripcion:
            'Triazol o mezcla doble; priorizar cuando sube HR y temperatura templada.',
        },
        {
          nombre: 'Roya Anaranjada',
          periodo:
            'Roya amarilla/estriada experimental desde fin de macollaje/encañazon hasta grano pastoso',
          etapas: [
            'Primer Nudo',
            'Hoja bandera',
            'Hoja Bandera',
            'Espigazon',
            'Antesis',
            'Llenado de granos',
          ],
          humedadBase: 92,
          horasMojadoCriticas: 4,
          lluviaCritica: 0.1,
          tempOptima: 10,
          formulaFuente:
            'El Jarroudi et al. 2017, DOI 10.1094/PDIS-12-16-1766-RE; ventana movil 10 dias adaptada por Chaman. Contrato 5,15/0,72/0,48/0,35/35,2 solo en sombra',
          prescripcion:
            'No emitir diagnostico ni prescripcion automatica; confirmar identidad y sintomas a campo.',
        },
        {
          nombre: 'Fusarium de la Espiga',
          periodo:
            'Desde Antesis/primeras espigas con anteras hasta 530 GDD base 0 C',
          etapas: ['Antesis'],
          humedadBase: 86,
          horasMojadoCriticas: 24,
          lluviaCritica: 15,
          tempOptima: 22,
          formulaFuente:
            'Moschini y Fortugno (1996); adaptacion varietal del contrato sanitario trigo 2026',
          prescripcion:
            'Metconazole/Prothioconazole/Tebuconazole en ventana de espiga.',
        },
      ],
      Soja: [
        {
          nombre: 'Fin de Ciclo',
          periodo: 'R3 a R5',
          etapas: ['R3', 'R5', 'Fructificacion', 'Inicio de llenado'],
          humedadBase: 80,
          horasMojadoCriticas: 12,
          lluviaCritica: 7,
          tempOptima: 24,
          formulaFuente: 'Motor operativo Fin de Ciclo de Soja',
          prescripcion:
            'Monitorear enfermedades de fin de ciclo y validar a campo antes de intervenir.',
        },
      ],
      Maiz: [
        {
          nombre: 'Roya del Maiz',
          periodo: 'Emergencia a floracion',
          etapas: ['Emergencia', 'Floracion', 'VT', 'R1'],
          humedadBase: 95,
          horasMojadoCriticas: 12,
          lluviaCritica: 0.2,
          tempOptima: 17,
          formulaFuente: 'Motor operativo Roya del Maiz',
          prescripcion:
            'Monitorear hibridos susceptibles y confirmar pustulas antes de intervenir.',
        },
        {
          nombre: 'Tizon Foliar del Maiz',
          periodo: 'V8 a R2',
          etapas: ['V8', 'VT', 'R1', 'R2'],
          humedadBase: 85,
          horasMojadoCriticas: 14,
          lluviaCritica: 10,
          tempOptima: 23,
          formulaFuente: 'Sin modelo epidemiologico validado',
          prescripcion:
            'No emitir porcentaje automático hasta validar un modelo epidemiológico.',
        },
      ],
      Cebada: [
        {
          nombre: 'Mancha en Red',
          periodo: 'Emergencia a espigazon',
          etapas: ['Emergencia', 'Primer Nudo', 'Hoja Bandera', 'Espigazon'],
          humedadBase: 82,
          horasMojadoCriticas: 12,
          lluviaCritica: 8,
          tempOptima: 17,
          formulaFuente: 'MANCHA EN RED - ENFERMEDADES EN CEBADA.xlsx',
          prescripcion:
            'DMI + QoI/SDHI registrado en cebada; validar destino cervecero y marbete.',
        },
        {
          nombre: 'Escaldadura de la Cebada',
          periodo: 'Emergencia a hoja bandera',
          etapas: ['Emergencia', 'Primer Nudo', 'Hoja Bandera'],
          humedadBase: 85,
          horasMojadoCriticas: 14,
          lluviaCritica: 6,
          tempOptima: 13,
          formulaFuente: 'ESCALDADURA - ENFERMEDADES EN CEBADA.xlsx',
          prescripcion:
            'Triazol + estrobilurina/carboxamida registrada; integrar rastrojo y sintomas.',
        },
        {
          nombre: 'Roya de la Hoja de Cebada',
          periodo: 'Primer nudo a llenado',
          etapas: [
            'Primer Nudo',
            'Hoja Bandera',
            'Espigazon',
            'Antesis',
            'Llenado de Granos',
          ],
          humedadBase: 70,
          horasMojadoCriticas: 8,
          lluviaCritica: 4,
          tempOptima: 18,
          formulaFuente: 'Hoja auxiliar - ENFERMEDADES EN CEBADA.xlsx',
          prescripcion:
            'Triazol o mezcla doble; proteger hojas funcionales con riesgo sostenido.',
        },
        {
          nombre: 'Fusariosis de la Espiga de Cebada',
          periodo: 'Espigazon y antesis',
          etapas: ['Espigazon', 'Antesis', 'Llenado de Granos'],
          humedadBase: 78,
          horasMojadoCriticas: 18,
          lluviaCritica: 5,
          tempOptima: 20,
          formulaFuente: 'Hoja auxiliar - ENFERMEDADES EN CEBADA.xlsx',
          prescripcion:
            'Triazol especifico de espiga; evitar estrobilurina sola y validar calidad/micotoxinas.',
        },
      ],
      Arveja: [
        {
          nombre: 'Complejo Ascochyta de la Arveja',
          periodo: 'Emergencia a formacion de vainas',
          etapas: ['E', 'Emergencia', 'R1', 'R3', 'Formacion de vainas'],
          humedadBase: 80,
          horasMojadoCriticas: 8,
          lluviaCritica: 0.1,
          tempOptima: 20,
          formulaFuente:
            'Roger y Tivoli (1999); screening ambiental experimental',
          prescripcion:
            'Sin prescripcion automatica; confirmar sintomas e inoculo a campo.',
        },
        {
          nombre: 'Mildiu de la Arveja',
          periodo: 'Emergencia a inicio de floracion',
          etapas: ['E', 'Emergencia', 'R1'],
          humedadBase: 91,
          horasMojadoCriticas: 4,
          lluviaCritica: 0,
          tempOptima: 16,
          formulaFuente:
            'Pegg y Mence (1970); screening ambiental experimental',
          prescripcion:
            'Sin prescripcion automatica; confirmar sintomas a campo.',
        },
        {
          nombre: 'Oidio de la Arveja',
          periodo: 'Floracion a formacion de vainas',
          etapas: ['R1', 'R3', 'Floracion', 'Formacion de vainas'],
          humedadBase: 50,
          horasMojadoCriticas: 0,
          lluviaCritica: 1,
          tempOptima: 24,
          formulaFuente: 'INTA Parana; screening de prioridad de monitoreo',
          prescripcion:
            'Sin prescripcion automatica; confirmar signos a campo.',
        },
      ],
    };

    const key = Object.keys(base).find(
      (item) => this.norm(item) === this.norm(cultivo),
    );
    return key ? base[key] : [];
  }

  private getSusceptibilidadVarietal(
    enfermedad: string,
    base: number,
    resistencias: Array<{ enfermedad?: string; multiplicador?: number }>,
  ): number {
    const match = resistencias.find((item) =>
      this.enfermedadCoincide(item.enfermedad, enfermedad),
    );
    const value = Number(match?.multiplicador ?? base);
    return this.clamp(Number.isFinite(value) ? value : base, 0.05, 1.2);
  }

  private getPerfilVarietal(
    enfermedad: string,
    base: number,
    resistencias: ResistenciaSimulador[],
  ) {
    const canonica = getEnfermedadCanonica(enfermedad);
    if (canonica && resistencias.length) {
      const perfil = resolverResistencia(resistencias as any, canonica.id);
      return {
        multiplicador: perfil.multiplicador,
        indiceResistencia: perfil.indiceResistencia,
        estado: perfil.estado,
        perfil: perfil.resistencia?.perfil || 'DESCONOCIDA',
        confianza: perfil.resistencia?.confianza || 'sin_datos',
        fuente: perfil.resistencia?.fuente,
        fuenteUrl: perfil.resistencia?.fuenteUrl,
        campaniaFuente: perfil.resistencia?.campaniaFuente || null,
        coherente: !perfil.desconocida,
        limitaciones: perfil.limitaciones,
        escenarioManual: false,
        alertable: false,
      };
    }

    const multiplicador = this.clamp(
      Number.isFinite(Number(base)) ? Number(base) : 1,
      0.05,
      1.2,
    );
    return {
      multiplicador,
      indiceResistencia: 1 - this.clamp(multiplicador, 0, 1),
      estado: 'escenario_manual',
      perfil: 'DESCONOCIDA',
      confianza: 'sin_datos',
      fuente: 'susceptibilidad manual del simulador',
      fuenteUrl: undefined,
      campaniaFuente: null,
      coherente: false,
      limitaciones: [
        'Escenario manual sin respaldo varietal trazable; no habilita alertas automaticas.',
      ],
      escenarioManual: true,
      alertable: false,
    };
  }

  private enfermedadCoincide(a?: string, b?: string): boolean {
    const na = this.norm(a);
    const nb = this.norm(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const aa = this.aliasesEnfermedad(na);
    const bb = this.aliasesEnfermedad(nb);
    return aa.some((item) => bb.includes(item));
  }

  private aliasesEnfermedad(nombre: string): string[] {
    const grupos = [
      ['MANCHA AMARILLA', 'DRECHSLERA TRITICI', 'MA'],
      ['MANCHA DE LA HOJA', 'SEPTORIA', 'SEPTORIOSIS', 'MH'],
      [
        'ROYA DE LA HOJA',
        'ROYA ANARANJADA DE LA HOJA',
        'PUCCINIA TRITICINA',
        'RH',
      ],
      ['ROYA ANARANJADA', 'ROYA AMARILLA', 'PUCCINIA STRIIFORMIS', 'RA'],
      ['FUSARIUM DE LA ESPIGA', 'FUSARIUM', 'FUSARIOSIS', 'FE'],
      ['ROYA DEL MAIZ', 'ROYA MAIZ'],
      ['TIZON FOLIAR DEL MAIZ', 'TIZON FOLIAR', 'TIZON'],
      ['FIN DE CICLO', 'FIN DE CICLO SOJA', 'EFC'],
      ['MANCHA EN RED', 'DRECHSLERA TERES', 'NET BLOTCH'],
      ['ESCALDADURA DE LA CEBADA', 'ESCALDADURA', 'RHYNCHOSPORIUM'],
      ['ROYA DE LA HOJA DE CEBADA', 'ROYA CEBADA'],
      ['FUSARIOSIS DE LA ESPIGA DE CEBADA', 'FUSARIOSIS CEBADA'],
    ].map((grupo) => grupo.map((item) => this.norm(item)));
    const grupo = grupos.find((items) => items.includes(this.norm(nombre)));
    return grupo || [this.norm(nombre)];
  }

  private norm(value?: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  private nivelRiesgo(riesgo: number): string {
    if (riesgo >= 70) return 'riesgo alto';
    if (riesgo >= 45) return 'riesgo medio';
    return 'riesgo bajo';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private round(value: number, digits = 2): number {
    if (!Number.isFinite(value)) return 0;
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  private async getClimaOpenMeteo(
    lat: number,
    lng: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<DiaClimaHuella[]> {
    const desde = this.toDateKey(fechaDesde);
    const hasta = this.toDateKey(fechaHasta);
    if (desde > hasta) {
      throw new BadRequestException(
        'La fecha de cosecha no puede ser anterior a la fecha de siembra.',
      );
    }

    const hoy = this.toDateKey(new Date().toISOString());
    const ayer = this.shiftDateKey(hoy, -1);
    const resultados: DiaClimaHuella[] = [];

    if (desde <= ayer) {
      const end = hasta < ayer ? hasta : ayer;
      resultados.push(
        ...(await this.fetchOpenMeteo('archive', lat, lng, desde, end)),
      );
    }
    if (hasta >= hoy) {
      const start = desde > hoy ? desde : hoy;
      resultados.push(
        ...(await this.fetchOpenMeteo('forecast', lat, lng, start, hasta)),
      );
    }

    return resultados.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  private async getClimaMalezasOpenMeteo(
    lat: number,
    lng: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<DiaClimaMalezas[]> {
    const desde = this.toDateKey(fechaDesde);
    const hasta = this.toDateKey(fechaHasta);
    if (desde > hasta) {
      throw new BadRequestException(
        'La fecha hasta no puede ser anterior a la fecha desde para malezas.',
      );
    }

    const hoy = this.toDateKey(new Date().toISOString());
    const ayer = this.shiftDateKey(hoy, -1);
    const resultados: DiaClimaMalezas[] = [];

    if (desde <= ayer) {
      const end = hasta < ayer ? hasta : ayer;
      resultados.push(
        ...(await this.fetchOpenMeteoMalezas('archive', lat, lng, desde, end)),
      );
    }
    if (hasta >= hoy) {
      const start = desde > hoy ? desde : hoy;
      resultados.push(
        ...(await this.fetchOpenMeteoMalezas(
          'forecast',
          lat,
          lng,
          start,
          hasta,
        )),
      );
    }

    const byDate = new Map<string, DiaClimaMalezas>();
    resultados.forEach((dia) => byDate.set(dia.fecha, dia));
    return [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  private async fetchOpenMeteo(
    tipo: 'archive' | 'forecast',
    lat: number,
    lng: number,
    desde: string,
    hasta: string,
  ): Promise<DiaClimaHuella[]> {
    if (desde > hasta) return [];
    const base =
      tipo === 'archive'
        ? 'https://archive-api.open-meteo.com/v1/archive'
        : 'https://api.open-meteo.com/v1/forecast';
    const url = new URL(base);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('start_date', desde);
    url.searchParams.set('end_date', hasta);
    url.searchParams.set(
      'daily',
      'precipitation_sum,et0_fao_evapotranspiration',
    );
    url.searchParams.set('timezone', 'America/Argentina/Buenos_Aires');

    try {
      const { data } = await axios.get(url.toString(), { timeout: 15000 });
      const fechas: string[] = data?.daily?.time || [];
      const lluvias: number[] = data?.daily?.precipitation_sum || [];
      const et0: number[] = data?.daily?.et0_fao_evapotranspiration || [];
      return fechas.map((fecha, index) => ({
        fecha,
        lluviaMm: Number(lluvias[index] || 0),
        et0Mm: Number(et0[index] || 0),
      }));
    } catch (error) {
      this.logger.error(`Error Open-Meteo ${tipo} ${desde}/${hasta}: ${error}`);
      throw new BadRequestException(
        'No se pudo obtener clima Open-Meteo para calcular la huella hidrica.',
      );
    }
  }

  private async fetchOpenMeteoMalezas(
    tipo: 'archive' | 'forecast',
    lat: number,
    lng: number,
    desde: string,
    hasta: string,
  ): Promise<DiaClimaMalezas[]> {
    if (desde > hasta) return [];
    const base =
      tipo === 'archive'
        ? 'https://archive-api.open-meteo.com/v1/archive'
        : 'https://api.open-meteo.com/v1/forecast';
    const url = new URL(base);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('start_date', desde);
    url.searchParams.set('end_date', hasta);
    url.searchParams.set(
      'daily',
      'temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration',
    );
    url.searchParams.set('timezone', 'America/Argentina/Buenos_Aires');

    try {
      const { data } = await axios.get(url.toString(), { timeout: 15000 });
      const fechas: string[] = data?.daily?.time || [];
      const temperaturas: number[] = data?.daily?.temperature_2m_mean || [];
      const lluvias: number[] = data?.daily?.precipitation_sum || [];
      const et0: number[] = data?.daily?.et0_fao_evapotranspiration || [];
      return fechas.map((fecha, index) => ({
        fecha,
        tipo: tipo === 'archive' ? 'historico' : 'pronostico',
        temperaturaMedia: this.toNumber(temperaturas[index]),
        lluviaMm: Number(lluvias[index] || 0),
        et0Mm: Number(et0[index] || 0),
      }));
    } catch (error) {
      this.logger.error(
        `Error Open-Meteo malezas ${tipo} ${desde}/${hasta}: ${error}`,
      );
      throw new BadRequestException(
        'No se pudo obtener clima Open-Meteo para calcular malezas.',
      );
    }
  }

  private toDateKey(fecha: string): string {
    return new Date(fecha).toISOString().slice(0, 10);
  }

  private shiftDateKey(fecha: string, dias: number): string {
    const date = new Date(`${fecha}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + dias);
    return date.toISOString().slice(0, 10);
  }

  private diffDias(desde: string, hasta: string): number {
    const start = new Date(`${desde}T00:00:00Z`).getTime();
    const end = new Date(`${hasta}T00:00:00Z`).getTime();
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  private toNumber(valor: unknown): number | undefined {
    const number = Number(valor);
    return Number.isFinite(number) ? number : undefined;
  }

  private porcentaje(valor: number): number {
    return this.clamp(valor, 0, 100);
  }
}
