import { Injectable } from '@nestjs/common';
import {
  CanalAlerta,
  CategoriaAlerta,
  ICalidadDatosAlerta,
  IAlerta,
  ICanalAlerta,
  ICreateAlerta,
  IListado,
  IQueryParam,
  IUpdateAlerta,
  SeveridadAlerta,
} from 'modelos/src';
import { AlertasRepository } from './repository';

interface EventoSiembra {
  idSiembra: string;
  descripcion: string;
  titulo?: string;
  tipo?: string;
  categoria?: CategoriaAlerta;
  severidad?: SeveridadAlerta;
  prioridad?: number;
  origen?: string;
  motor?: string;
  versionMotor?: string;
  lectura?: string;
  recomendacion?: string;
  accionSugerida?: string;
  calidadDatos?: ICalidadDatosAlerta;
  canales?: ICanalAlerta[];
  dedupeKey?: string;
  fecha: string;
  eventKey: string;
  reporte: Record<string, any>;
  tenant: {
    idQuimica?: string;
    idDistribuidor?: string;
    idProductor?: string;
    idEstablecimiento?: string;
  };
}

interface EventoNormalizado {
  fecha: string;
  eventKey: string;
  dedupeKey: string;
  titulo: string;
  tipo: string;
  categoria: CategoriaAlerta;
  severidad: SeveridadAlerta;
  prioridad: number;
  origen: string;
  motor: string;
  versionMotor?: string;
  lectura?: string;
  recomendacion?: string;
  accionSugerida?: string;
  calidadDatos: ICalidadDatosAlerta;
  canales: ICanalAlerta[];
  reporte: Record<string, any>;
}

@Injectable()
export class AlertasService {
  constructor(private repository: AlertasRepository) {}

  async getById(id: string): Promise<IAlerta> {
    return await this.repository.getById(id);
  }

  async getByIdSiembraActiva(
    id: string,
    descripcion?: string,
    dedupeKey?: string,
  ): Promise<IAlerta> {
    const query: IQueryParam = {
      filter: JSON.stringify({
        idSiembra: id,
        activa: true,
        ...(dedupeKey ? { dedupeKey } : descripcion ? { descripcion } : {}),
      }),
      sort: '-fechaUltimoEvento,-fecha',
      limit: 1,
    };
    const res = await this.repository.get(query);
    return res.datos[0];
  }

  async get(filtro: IQueryParam): Promise<IListado<IAlerta>> {
    return await this.repository.get(filtro);
  }

  async update(id: string, data: IUpdateAlerta): Promise<IAlerta> {
    return await this.repository.update(id, data);
  }

  async create(data: IAlerta): Promise<IAlerta> {
    return await this.repository.create(data);
  }

  async finalizarEventoSiembra(
    idSiembra: string,
    descripcion: string,
    comentario: string,
    dedupeKey?: string,
  ): Promise<boolean> {
    let alerta = await this.getByIdSiembraActiva(
      idSiembra,
      descripcion,
      dedupeKey,
    );
    if (!alerta && this.esClaveSanitaria(dedupeKey)) {
      alerta = await this.getAlertaSanitariaLegadaActiva(
        idSiembra,
        this.tituloSanitarioDesdeDescripcion(descripcion),
      );
    }
    if (!alerta?._id) return false;

    const fecha = new Date().toISOString();
    await this.update(alerta._id, {
      activa: false,
      estadoActual: 'Finalizada',
      fechaVencimiento: fecha,
      estados: [
        ...(alerta.estados || []),
        {
          fecha,
          estado: 'Finalizada',
          comentario,
        },
      ],
    });
    return true;
  }

  async registrarEventoSiembra(
    evento: EventoSiembra,
  ): Promise<{ alerta?: IAlerta; creada: boolean; duplicada: boolean }> {
    const normalizado = this.normalizarEvento(evento);
    let alerta = await this.getByIdSiembraActiva(
      evento.idSiembra,
      evento.descripcion,
      normalizado.dedupeKey,
    );

    if (!alerta && normalizado.dedupeKey) {
      alerta = await this.getByIdSiembraActiva(
        evento.idSiembra,
        evento.descripcion,
      );
    }

    if (!alerta && this.esClaveSanitaria(normalizado.dedupeKey)) {
      alerta = await this.getAlertaSanitariaLegadaActiva(
        evento.idSiembra,
        normalizado.titulo,
      );
    }

    if (alerta) {
      const reportes = alerta.reportes || [];
      const duplicada = reportes.some((r) => r?.eventKey === evento.eventKey);
      if (duplicada) {
        return { alerta, creada: false, duplicada: true };
      }
      const update: IUpdateAlerta = {
        reportes: [...reportes, normalizado.reporte],
        descripcion: evento.descripcion,
        titulo: normalizado.titulo,
        tipo: normalizado.tipo,
        categoria: normalizado.categoria,
        // El reporte conserva el maximo historico. La cabecera debe representar
        // el estado vigente para que una alerta pueda desescalar correctamente.
        severidad: normalizado.severidad,
        prioridad: normalizado.prioridad,
        origen: normalizado.origen,
        motor: normalizado.motor,
        versionMotor: normalizado.versionMotor,
        eventKey: normalizado.eventKey,
        dedupeKey: alerta.dedupeKey || normalizado.dedupeKey,
        lectura: normalizado.lectura,
        recomendacion: normalizado.recomendacion,
        accionSugerida: normalizado.accionSugerida,
        calidadDatos: normalizado.calidadDatos,
        canales: normalizado.canales,
        fechaUltimoEvento: normalizado.fecha,
      };
      return {
        alerta: await this.update(alerta._id, update),
        creada: false,
        duplicada: false,
      };
    }

    const create: ICreateAlerta = {
      idSiembra: evento.idSiembra,
      activa: true,
      reportes: [normalizado.reporte],
      estadoActual: 'Nueva',
      estados: [
        {
          fecha: normalizado.fecha,
          estado: 'Nueva',
        },
      ],
      fecha: normalizado.fecha,
      fechaUltimoEvento: normalizado.fecha,
      idDistribuidor: evento.tenant.idDistribuidor,
      idEstablecimiento: evento.tenant.idEstablecimiento,
      idProductor: evento.tenant.idProductor,
      idQuimica: evento.tenant.idQuimica,
      descripcion: evento.descripcion,
      titulo: normalizado.titulo,
      tipo: normalizado.tipo,
      categoria: normalizado.categoria,
      severidad: normalizado.severidad,
      prioridad: normalizado.prioridad,
      origen: normalizado.origen,
      motor: normalizado.motor,
      versionMotor: normalizado.versionMotor,
      eventKey: normalizado.eventKey,
      dedupeKey: normalizado.dedupeKey,
      lectura: normalizado.lectura,
      recomendacion: normalizado.recomendacion,
      accionSugerida: normalizado.accionSugerida,
      calidadDatos: normalizado.calidadDatos,
      canales: normalizado.canales,
    };
    return {
      alerta: await this.create(create),
      creada: true,
      duplicada: false,
    };
  }

  /**
   * Antes de v4 todas las patologias compartian la descripcion generica
   * "Riesgo de Enfermedad" y no tenian dedupeKey por enfermedad. Esta busqueda
   * acotada permite cerrar o migrar esas alertas sin dejar eventos legados
   * activos ni mezclar enfermedades distintas.
   */
  private async getAlertaSanitariaLegadaActiva(
    idSiembra: string,
    titulo?: string,
  ): Promise<IAlerta | undefined> {
    if (!titulo) return undefined;
    const query: IQueryParam = {
      filter: JSON.stringify({
        idSiembra,
        activa: true,
        descripcion: 'Riesgo de Enfermedad',
        titulo,
      }),
      sort: '-fechaUltimoEvento,-fecha',
      limit: 1,
    };
    const res = await this.repository.get(query);
    return res.datos[0];
  }

  private esClaveSanitaria(dedupeKey?: string): boolean {
    return String(dedupeKey || '').includes(':sanitaria:enfermedad:');
  }

  private tituloSanitarioDesdeDescripcion(descripcion?: string): string {
    return String(descripcion || '')
      .replace(/^Predicci[oó]n sanitaria:\s*/i, '')
      .trim();
  }

  private normalizarEvento(evento: EventoSiembra): EventoNormalizado {
    const fecha = evento.fecha || new Date().toISOString();
    const tipo = evento.tipo || this.tipoDesdeReporte(evento);
    const categoria = evento.categoria || this.categoriaDesdeTipo(tipo);
    const severidad =
      evento.severidad || this.severidadDesdeReporte(evento.reporte);
    const prioridad = evento.prioridad ?? this.prioridadPorSeveridad(severidad);
    const titulo =
      evento.titulo ||
      this.tituloDesdeEvento(evento.descripcion, evento.reporte);
    const lectura = evento.lectura || this.lecturaDesdeReporte(evento.reporte);
    const recomendacion =
      evento.recomendacion || this.recomendacionDesdeReporte(evento.reporte);
    const accionSugerida = evento.accionSugerida || recomendacion;
    const origen = evento.origen || this.origenDesdeCategoria(categoria);
    const motor = evento.motor || this.motorDesdeCategoria(categoria);
    const dedupeKey =
      evento.dedupeKey ||
      [evento.idSiembra, categoria, tipo, this.slug(titulo)].join(':');
    const calidadDatos =
      evento.calidadDatos || this.calidadDatosDesdeReporte(evento.reporte);
    const canales = evento.canales || this.canalesPorSeveridad(severidad);
    const reporte = {
      ...evento.reporte,
      fecha,
      eventKey: evento.eventKey,
      dedupeKey,
      titulo,
      tipo,
      categoria,
      severidad,
      prioridad,
      lectura,
      recomendacion,
      accionSugerida,
      calidadDatos,
      origen,
      motor,
      versionMotor: evento.versionMotor,
      canales,
    };

    return {
      fecha,
      eventKey: evento.eventKey,
      dedupeKey,
      titulo,
      tipo,
      categoria,
      severidad,
      prioridad,
      origen,
      motor,
      versionMotor: evento.versionMotor,
      lectura,
      recomendacion,
      accionSugerida,
      calidadDatos,
      canales,
      reporte,
    };
  }

  private tipoDesdeReporte(evento: EventoSiembra): string {
    const tipo = evento.reporte?.tipo;
    if (tipo) {
      return String(tipo);
    }
    const descripcion = this.slug(evento.descripcion);
    if (descripcion.includes('helada')) return 'helada';
    if (descripcion.includes('granizo')) return 'granizo';
    if (descripcion.includes('maleza')) return 'maleza';
    if (descripcion.includes('enfermedad')) return 'enfermedad';
    if (descripcion.includes('riego')) return 'riego';
    return 'evento';
  }

  private categoriaDesdeTipo(tipo: string): CategoriaAlerta {
    const key = this.slug(tipo);
    if (key.includes('enfermedad')) return 'sanitaria';
    if (key.includes('maleza')) return 'malezas';
    if (key.includes('helada') || key.includes('granizo')) {
      return 'agroclimatica';
    }
    if (key.includes('riego')) return 'riego';
    if (key.includes('sensor') || key.includes('mqtt')) return 'sensor';
    if (key.includes('ndvi') || key.includes('satel')) return 'satelital';
    return 'operativa';
  }

  private severidadDesdeReporte(reporte: Record<string, any>): SeveridadAlerta {
    const nivel = this.slug(reporte?.nivel || reporte?.severidad || '');
    if (['critica', 'critico', 'muy_alta', 'muy-alta'].includes(nivel)) {
      return 'critica';
    }
    if (nivel === 'alta' || nivel === 'alto') return 'alta';
    if (nivel === 'media' || nivel === 'medio') return 'media';
    if (nivel === 'baja' || nivel === 'bajo') return 'baja';

    const valor = this.numeroRiesgo(reporte);
    if (valor >= 75) return 'critica';
    if (valor >= 45) return 'alta';
    if (valor >= 15) return 'media';
    return 'baja';
  }

  private numeroRiesgo(reporte: Record<string, any>): number {
    const campos = [
      reporte?.resultado,
      reporte?.riesgoPct,
      reporte?.posibilidadPct,
      reporte?.avancePct,
      reporte?.emergenciaPct,
      reporte?.score,
      reporte?.porcentaje,
    ];
    const valor = campos.find((v) => Number.isFinite(Number(v)));
    return Math.max(0, Math.min(100, Number(valor || 0)));
  }

  private prioridadPorSeveridad(severidad: SeveridadAlerta): number {
    const pesos: Record<SeveridadAlerta, number> = {
      baja: 25,
      media: 50,
      alta: 75,
      critica: 100,
    };
    return pesos[severidad];
  }

  private canalesPorSeveridad(severidad: SeveridadAlerta): ICanalAlerta[] {
    const canales: ICanalAlerta[] = [
      {
        canal: 'app',
        habilitado: true,
        estado: 'enviada',
        fecha: new Date().toISOString(),
        detalle: 'Visible en el centro de alarmas de Chaman.',
      },
    ];
    if (severidad === 'alta' || severidad === 'critica') {
      const externos: CanalAlerta[] = ['email', 'telegram'];
      canales.push(
        ...externos.map((canal) => ({
          canal,
          habilitado: false,
          estado: 'no_configurado' as const,
          detalle:
            'Canal preparado; falta configurar credenciales y politica de envio.',
        })),
      );
    }
    return canales;
  }

  private calidadDatosDesdeReporte(
    reporte: Record<string, any>,
  ): ICalidadDatosAlerta {
    const fuente = String(
      reporte?.fuente || reporte?.source || reporte?.origen || 'motor Chaman',
    );
    const calidad = reporte?.calidadDatos || reporte?.calidad || {};
    if (typeof calidad === 'object' && calidad?.nivel) {
      return calidad;
    }
    return {
      nivel: reporte?.sinDatos ? 'sin_datos' : 'media',
      fuente,
      detalle:
        reporte?.detalleCalidad ||
        'Evento generado con los datos disponibles para el lote.',
    };
  }

  private tituloDesdeEvento(
    descripcion: string,
    reporte: Record<string, any>,
  ): string {
    return (
      reporte?.enfermedad ||
      reporte?.maleza ||
      reporte?.titulo ||
      reporte?.nombre ||
      descripcion ||
      'Alarma operativa'
    );
  }

  private lecturaDesdeReporte(
    reporte: Record<string, any>,
  ): string | undefined {
    return reporte?.lectura || reporte?.mensaje || reporte?.resumen;
  }

  private recomendacionDesdeReporte(
    reporte: Record<string, any>,
  ): string | undefined {
    return reporte?.recomendacion || reporte?.accion || reporte?.sugerencia;
  }

  private origenDesdeCategoria(categoria: CategoriaAlerta): string {
    if (categoria === 'agroclimatica') return 'Open-Meteo / clima de zona';
    if (categoria === 'sanitaria') return 'Motor sanitario Chaman';
    if (categoria === 'malezas') return 'Motor de malezas Chaman';
    if (categoria === 'riego') return 'Motor de riego Chaman';
    if (categoria === 'sensor') return 'Sensores / MQTT';
    if (categoria === 'satelital') return 'Motor satelital Chaman';
    return 'Chaman';
  }

  private motorDesdeCategoria(categoria: CategoriaAlerta): string {
    const motores: Record<CategoriaAlerta, string> = {
      agroclimatica: 'riesgos-agroclimaticos',
      sanitaria: 'prediccion-enfermedades',
      malezas: 'prediccion-malezas',
      riego: 'riego',
      sensor: 'sensores',
      satelital: 'satelital',
      operativa: 'operativo',
      sistema: 'sistema',
    };
    return motores[categoria];
  }

  private slug(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
