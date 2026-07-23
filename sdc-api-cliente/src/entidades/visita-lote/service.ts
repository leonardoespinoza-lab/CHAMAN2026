import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ICreateVisitaLote,
  IFilter,
  IListado,
  IPermiso,
  IUpdateVisitaLote,
  IUsuario,
  IVisitaLote,
} from 'modelos/src';
import { LotesService } from '../lote/service';
import { VisitasLoteRepository } from './repository';

@Injectable()
export class VisitasLoteService {
  constructor(
    private repository: VisitasLoteRepository,
    private lotesService: LotesService,
  ) {}

  async getByLote(idLote: string, permiso: IPermiso): Promise<IListado<IVisitaLote>> {
    await this.verificarModulo(permiso);
    await this.lotesService.getById(idLote, permiso);
    const filter: IFilter<IVisitaLote> = { idLote, archivado: { $ne: true } };
    return await this.repository.get({
      filter: JSON.stringify(filter),
      sort: '-fechaVisita,-fechaCreacion',
      limit: 0,
    });
  }

  async getById(id: string, permiso: IPermiso): Promise<IVisitaLote> {
    await this.verificarModulo(permiso);
    const visita = await this.repository.getById(id);
    if (!visita?._id || !visita.idLote) throw new NotFoundException('Visita no encontrada');
    await this.lotesService.getById(visita.idLote, permiso);
    return visita;
  }

  async create(
    data: ICreateVisitaLote,
    permiso: IPermiso,
    user: IUsuario,
  ): Promise<IVisitaLote> {
    await this.verificarModulo(permiso);
    if (!data.idLote) throw new BadRequestException('Falta identificar el lote.');
    const lote = await this.lotesService.getById(data.idLote, permiso);
    const fecha = this.fecha(data.fechaVisita);
    if (!fecha) throw new BadRequestException('Ingrese una fecha de visita valida.');
    const autor = this.autor(user);
    return await this.repository.create({
      ...this.camposCreacion(data),
      idLote: lote._id,
      idTenant: lote.idTenant,
      idAsesorPropietario: lote.idAsesorPropietario,
      idQuimica: lote.idQuimica,
      idDistribuidor: lote.idDistribuidor,
      idProductor: lote.idProductor,
      idEstablecimiento: lote.idEstablecimiento,
      fechaVisita: fecha,
      creadaPorUsuario: user?._id,
      creadaPorNombre: autor,
      actualizadoPorUsuario: user?._id,
      actualizadoPorNombre: autor,
      fechaActualizacion: new Date().toISOString(),
    } as any);
  }

  async update(
    id: string,
    data: IUpdateVisitaLote,
    permiso: IPermiso,
    user: IUsuario,
  ): Promise<IVisitaLote> {
    const visita = await this.getById(id, permiso);
    const incluyeIdsFotos = this.tieneCampo(data, 'idsFotos');
    const idsFotos =
      incluyeIdsFotos && Array.isArray(data.idsFotos)
        ? Array.from(new Set(data.idsFotos.map(String).filter(Boolean)))
        : undefined;
    if (idsFotos && idsFotos.length > 100) {
      throw new BadRequestException(
        'Una visita no puede asociar mas de 100 fotos.',
      );
    }
    if (idsFotos?.length) {
      await this.validarFotosDelLote(idsFotos, String(visita.idLote));
    }
    const autor = this.autor(user);
    return await this.repository.update(id, {
      ...this.camposActualizacion(data),
      ...(incluyeIdsFotos ? { idsFotos } : {}),
      fechaActualizacion: new Date().toISOString(),
      actualizadoPorUsuario: user?._id,
      actualizadoPorNombre: autor,
    });
  }

  async archive(id: string, permiso: IPermiso, user: IUsuario): Promise<IVisitaLote> {
    await this.getById(id, permiso);
    const autor = this.autor(user);
    return await this.repository.update(id, {
      archivado: true,
      fechaArchivado: new Date().toISOString(),
      archivadoPor: autor,
      motivoArchivado: 'Visita archivada desde la bitacora del lote',
      fechaActualizacion: new Date().toISOString(),
      actualizadoPorUsuario: user?._id,
      actualizadoPorNombre: autor,
    });
  }

  private verificarModulo(permiso: IPermiso): void {
    if (permiso.modulos?.Visitas === false) {
      throw new BadRequestException('El calendario de visitas no esta habilitado para este usuario.');
    }
  }

  private async validarFotosDelLote(
    idsFotos: string[],
    idLote: string,
  ): Promise<void> {
    const listado = await this.repository.getFotosByIds(idsFotos);
    const fotos = listado?.datos || [];
    const idsEncontrados = new Set(
      fotos.map((foto) => String(foto._id || '')).filter(Boolean),
    );
    const todasExisten = idsFotos.every((id) => idsEncontrados.has(id));
    const todasDelLote = fotos.every(
      (foto) =>
        !!foto.idLote && String(foto.idLote) === String(idLote),
    );
    if (!todasExisten || fotos.length !== idsFotos.length || !todasDelLote) {
      throw new BadRequestException(
        'Todas las fotos deben existir y pertenecer al mismo lote de la visita.',
      );
    }
  }

  private camposCreacion(data: Partial<IVisitaLote>): Partial<IVisitaLote> {
    const estado = ['programada', 'realizada', 'cancelada'].includes(String(data.estado))
      ? data.estado
      : 'realizada';
    return {
      titulo: this.texto(data.titulo, 120) || 'Visita al lote',
      tipo: data.tipo || 'recorrida_general',
      estado,
      horaInicio: this.hora(data.horaInicio),
      horaFin: this.hora(data.horaFin),
      actividades: Array.isArray(data.actividades)
        ? Array.from(new Set(data.actividades)).slice(0, 12)
        : [],
      participantes: Array.isArray(data.participantes)
        ? data.participantes.map((x) => this.texto(x, 100) || '').filter(Boolean).slice(0, 20)
        : [],
      observaciones: this.texto(data.observaciones, 5000),
      hallazgos: this.texto(data.hallazgos, 5000),
      recomendaciones: this.texto(data.recomendaciones, 5000),
      proximaVisita: this.fecha(data.proximaVisita),
      latitud: this.numero(data.latitud, -90, 90),
      longitud: this.numero(data.longitud, -180, 180),
      precisionMetros: this.numero(data.precisionMetros, 0),
    };
  }

  private camposActualizacion(data: IUpdateVisitaLote): IUpdateVisitaLote {
    const patch: IUpdateVisitaLote = {};

    if (this.tieneCampo(data, 'fechaVisita')) {
      const fechaVisita = this.fecha(data.fechaVisita);
      if (!fechaVisita) {
        throw new BadRequestException('Ingrese una fecha de visita valida.');
      }
      patch.fechaVisita = fechaVisita;
    }
    if (this.tieneCampo(data, 'titulo')) {
      patch.titulo = this.texto(data.titulo, 120);
    }
    if (this.tieneCampo(data, 'tipo')) {
      patch.tipo = data.tipo || 'recorrida_general';
    }
    if (this.tieneCampo(data, 'estado')) {
      patch.estado = ['programada', 'realizada', 'cancelada'].includes(
        String(data.estado),
      )
        ? data.estado
        : 'realizada';
    }
    if (this.tieneCampo(data, 'horaInicio')) {
      patch.horaInicio = this.hora(data.horaInicio);
    }
    if (this.tieneCampo(data, 'horaFin')) {
      patch.horaFin = this.hora(data.horaFin);
    }
    if (this.tieneCampo(data, 'actividades')) {
      patch.actividades = Array.isArray(data.actividades)
        ? Array.from(new Set(data.actividades)).slice(0, 12)
        : [];
    }
    if (this.tieneCampo(data, 'participantes')) {
      patch.participantes = Array.isArray(data.participantes)
        ? data.participantes
            .map((x) => this.texto(x, 100) || '')
            .filter(Boolean)
            .slice(0, 20)
        : [];
    }
    if (this.tieneCampo(data, 'observaciones')) {
      patch.observaciones = this.texto(data.observaciones, 5000);
    }
    if (this.tieneCampo(data, 'hallazgos')) {
      patch.hallazgos = this.texto(data.hallazgos, 5000);
    }
    if (this.tieneCampo(data, 'recomendaciones')) {
      patch.recomendaciones = this.texto(data.recomendaciones, 5000);
    }
    if (this.tieneCampo(data, 'proximaVisita')) {
      patch.proximaVisita = this.fecha(data.proximaVisita);
    }
    if (this.tieneCampo(data, 'latitud')) {
      patch.latitud = this.numero(data.latitud, -90, 90);
    }
    if (this.tieneCampo(data, 'longitud')) {
      patch.longitud = this.numero(data.longitud, -180, 180);
    }
    if (this.tieneCampo(data, 'precisionMetros')) {
      patch.precisionMetros = this.numero(data.precisionMetros, 0);
    }

    return patch;
  }

  private tieneCampo(
    data: Partial<IVisitaLote>,
    campo: keyof IVisitaLote,
  ): boolean {
    return Object.prototype.hasOwnProperty.call(data, campo);
  }

  private fecha(value: unknown): string | undefined {
    if (!value) return undefined;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private hora(value: unknown): string | undefined {
    const result = String(value ?? '').trim();
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(result) ? result : undefined;
  }

  private texto(value: unknown, max: number): string | undefined {
    const result = String(value ?? '').trim().slice(0, max);
    return result || undefined;
  }

  private numero(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
  }

  private autor(user: IUsuario): string {
    return user?.datosPersonales?.nombre || user?.username || 'Usuario Chaman';
  }
}
