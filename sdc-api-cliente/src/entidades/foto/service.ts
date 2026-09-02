import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  IListado,
  IQueryParam,
  IFilter,
  IPermiso,
  IFoto,
  ILote,
  IUpdateFoto,
  IUsuario,
} from 'modelos/src';
import { FotosRepository } from './repository';
import { permisoPuedeVerLote } from '../../auxiliares/authorization/alcance-permiso';
import { VisitasLoteService } from '../visita-lote/service';

@Injectable()
export class FotosService {
  constructor(
    private repository: FotosRepository,
    private visitasLoteService: VisitasLoteService,
  ) {}

  async getImagen(id: string, permiso: IPermiso): Promise<any> {
    if (!String(id || '').trim()) {
      throw new BadRequestException('Falta identificar la foto.');
    }
    // Resolve the URL exclusively from the persisted, authorized record.
    // Never accept a caller-provided URL: doing so would turn this endpoint
    // into an authenticated server-side request proxy.
    const foto = await this.getById(id, permiso);
    if (foto.tipoMedio === 'audio') {
      throw new BadRequestException('El registro solicitado no es una imagen.');
    }
    if (foto.archivado) {
      throw new NotFoundException('Foto no encontrada');
    }
    return await this.repository.getImagen(foto);
  }

  async getAudio(
    id: string,
    permiso: IPermiso,
  ): Promise<{ bytes: Buffer; mimeType: string }> {
    const audio = await this.getById(id, permiso);
    if (audio.tipoMedio !== 'audio' || audio.archivado) {
      throw new NotFoundException('Audio no encontrado');
    }
    return {
      bytes: await this.repository.getAudio(audio),
      mimeType: this.mimeAudioPermitido(audio.mimeType),
    };
  }

  async getById(id: string, permiso: IPermiso): Promise<IFoto> {
    const data = await this.repository.getById(id);
    if (!data?._id) throw new NotFoundException('Foto no encontrada');
    const lote = data.idLote ? await this.repository.getLoteById(data.idLote) : undefined;
    if (!this.puedeVer(permiso) && (!lote || !this.puedeVerLote(lote, permiso))) {
      throw new Error('No tiene permiso para ver esta foto');
    }
    return data;
  }

  async getByIdLote(
    idLote: string,
    permiso: IPermiso,
  ): Promise<IListado<IFoto>> {
    const lote = await this.repository.getLoteById(idLote);
    if (!this.puedeVerLote(lote, permiso)) {
      throw new Error('No tiene permiso para ver estas fotos');
    }
    const filter: IFilter<IFoto> = { idLote, archivado: { $ne: true } };
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
    };
    const data = await this.repository.get(query);
    return data;
  }

  async get(query: IQueryParam, permiso: IPermiso): Promise<IListado<IFoto>> {
    if (!this.puedeVer(permiso)) {
      throw new Error('No tiene permiso para ver estas fotos');
    }
    // Los listados historicos de camaras y time-lapse esperan exclusivamente
    // imagenes. Los audios se consultan desde el registro de campo del lote.
    // Si un consumidor pide explicitamente tipoMedio, respetamos su filtro.
    let filter: IFilter<IFoto> = {};
    try {
      filter = query.filter ? JSON.parse(query.filter) : {};
    } catch {
      return await this.repository.get(query);
    }
    if (!Object.prototype.hasOwnProperty.call(filter, 'tipoMedio')) {
      filter.tipoMedio = { $ne: 'audio' } as any;
    }
    return await this.repository.get({
      ...query,
      filter: JSON.stringify(filter),
    });
  }

  async delete(id: string, permiso: IPermiso): Promise<IFoto> {
    const foto = await this.getById(id, permiso);
    if (foto.fuente !== 'campo' && permiso.nivel !== 'Admin') {
      throw new BadRequestException('Los registros automaticos solo pueden administrarse desde Chaman.');
    }
    if (foto.fuente === 'campo') {
      return await this.repository.update(id, {
        archivado: true,
        fechaArchivado: new Date().toISOString(),
        archivadoPor: 'usuario',
        motivoArchivado:
          foto.tipoMedio === 'audio'
            ? 'Audio de campo retirado desde el lote'
            : 'Registro fotografico retirado desde el lote',
      });
    }
    return await this.repository.delete(id);
  }

  async update(id: string, data: IUpdateFoto, permiso: IPermiso): Promise<IFoto> {
    const foto = await this.getById(id, permiso);
    if (foto.fuente !== 'campo' && permiso.nivel !== 'Admin') {
      throw new BadRequestException('Solo se puede editar evidencia fotografica de campo.');
    }
    const idVisita = this.texto(data.idVisita, 100);
    if (idVisita) {
      const visita = await this.visitasLoteService.getById(idVisita, permiso);
      if (
        !foto.idLote ||
        String(visita.idLote || '') !== String(foto.idLote)
      ) {
        throw new BadRequestException(
          'La visita seleccionada no pertenece al lote de esta foto.',
        );
      }
    }
    const permitidos: IUpdateFoto = {
      titulo: this.texto(data.titulo, 120),
      descripcion: this.texto(data.descripcion, 3000),
      etiquetas: Array.isArray(data.etiquetas) ? data.etiquetas.slice(0, 20).map((x) => this.texto(x, 50) || '') : undefined,
      idVisita,
    };
    return await this.repository.update(id, permitidos);
  }

  async uploadCampo(
    files: any[],
    body: Record<string, any>,
    permiso: IPermiso,
    user: IUsuario,
  ): Promise<IFoto[]> {
    if (permiso.modulos?.RegistroFotografico === false) {
      throw new BadRequestException('El registro fotografico no esta habilitado para este usuario.');
    }
    if (!body.idLote) throw new BadRequestException('Falta identificar el lote.');
    if (!files?.length) throw new BadRequestException('Tome o seleccione al menos una foto.');
    const lote = await this.repository.getLoteById(body.idLote);
    if (!this.puedeVerLote(lote, permiso) && permiso.nivel !== 'Admin') {
      throw new BadRequestException('No tiene permiso para registrar fotos en este lote.');
    }
    if (body.idVisita) {
      const visita = await this.visitasLoteService.getById(String(body.idVisita), permiso);
      if (String(visita.idLote || '') !== String(body.idLote)) {
        throw new BadRequestException('La visita seleccionada no pertenece a este lote.');
      }
    }

    const nombreUsuario =
      user?.datosPersonales?.nombre || user?.username || 'Usuario Chaman';
    const creadas: IFoto[] = [];
    for (const file of files) {
      this.validarImagen(file);
      const stored = await this.repository.uploadCampo(body.idLote, file);
      creadas.push(
        await this.repository.create({
          idLote: body.idLote,
          idVisita: body.idVisita || undefined,
          fuente: 'campo',
          tipoMedio: 'imagen',
          url: stored.publicUrl,
          fechaCaptura: body.fechaCaptura || stored.fechaCaptura,
          nombreOriginal: file.originalname,
          mimeType: stored.contentType || file.mimetype,
          sizeBytes: stored.size || file.size,
          titulo: this.texto(body.titulo, 120),
          descripcion: this.texto(body.descripcion, 3000),
          etiquetas: this.lista(body.etiquetas),
          latitud: this.numero(body.latitud, -90, 90),
          longitud: this.numero(body.longitud, -180, 180),
          precisionMetros: this.numero(body.precisionMetros, 0),
          creadaPorUsuario: user?._id,
          creadaPorNombre: nombreUsuario,
          estadoIA: 'lista',
          metadata: { origen: 'captura_web_movil', version: 1 },
        }),
      );
    }
    return creadas;
  }

  async uploadAudio(
    file: any,
    body: Record<string, any>,
    permiso: IPermiso,
    user: IUsuario,
  ): Promise<IFoto> {
    if (permiso.modulos?.RegistroFotografico === false) {
      throw new BadRequestException('El registro de campo no esta habilitado para este usuario.');
    }
    if (!body.idLote) throw new BadRequestException('Falta identificar el lote.');
    if (!file) throw new BadRequestException('Grabe o seleccione un audio.');
    const lote = await this.repository.getLoteById(body.idLote);
    if (!this.puedeVerLote(lote, permiso) && permiso.nivel !== 'Admin') {
      throw new BadRequestException('No tiene permiso para registrar audios en este lote.');
    }
    if (body.idVisita) {
      const visita = await this.visitasLoteService.getById(String(body.idVisita), permiso);
      if (String(visita.idLote || '') !== String(body.idLote)) {
        throw new BadRequestException('La visita seleccionada no pertenece a este lote.');
      }
    }
    this.validarAudio(file);
    const stored = await this.repository.uploadAudio(body.idLote, file);
    const nombreUsuario = user?.datosPersonales?.nombre || user?.username || 'Usuario Chaman';
    return await this.repository.create({
      idLote: body.idLote,
      idVisita: body.idVisita || undefined,
      fuente: 'campo',
      tipoMedio: 'audio',
      url: stored.publicUrl,
      fechaCaptura: body.fechaCaptura || stored.fechaCaptura,
      nombreOriginal: file.originalname,
      mimeType: stored.contentType || file.mimetype,
      sizeBytes: stored.size || file.size,
      duracionSegundos: this.numero(body.duracionSegundos, 0),
      titulo: this.texto(body.titulo, 120),
      descripcion: this.texto(body.descripcion, 3000),
      etiquetas: this.lista(body.etiquetas),
      latitud: this.numero(body.latitud, -90, 90),
      longitud: this.numero(body.longitud, -180, 180),
      precisionMetros: this.numero(body.precisionMetros, 0),
      creadaPorUsuario: user?._id,
      creadaPorNombre: nombreUsuario,
      estadoIA: 'lista',
      metadata: { origen: 'audio_web_movil', version: 1 },
    });
  }

  // Private

  private puedeVer(permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') {
      return true;
    }
    return false;
  }

  private puedeVerLote(lote: ILote, permiso: IPermiso): boolean {
    if (permiso.nivel === 'Admin') return true;
    if (permiso.nivel === 'Tenant')
      return (
        !!lote.idTenant &&
        String(lote.idTenant) === String(permiso.idTenant || '')
      );
    if (permiso.nivel === 'Quimica')
      return lote.idQuimica === permiso.idQuimica;
    if (permiso.nivel === 'Distribuidor')
      return lote.idDistribuidor === permiso.idDistribuidor;
    if (permiso.nivel === 'Productor')
      return lote.idProductor === permiso.idProductor;
    if (permiso.nivel === 'Establecimiento')
      return lote.idEstablecimiento === permiso.idEstablecimiento;
    if (permiso.nivel === 'Asesor') return permisoPuedeVerLote(permiso, lote);
    return false;
  }

  private validarImagen(file: any): void {
    if (!/^image\/(jpeg|png|webp)$/i.test(String(file?.mimetype || ''))) {
      throw new BadRequestException('Solo se admiten imagenes JPG, PNG o WebP.');
    }
    if (!file?.buffer?.length || file.size > 12 * 1024 * 1024) {
      throw new BadRequestException('Cada imagen debe pesar menos de 12 MB.');
    }
    if (!this.firmaImagenValida(file.buffer, file.mimetype)) {
      throw new BadRequestException('El contenido del archivo no coincide con una imagen valida.');
    }
  }

  private validarAudio(file: any): void {
    const mimeType = String(file?.mimetype || '').split(';', 1)[0];
    if (!/^audio\/(webm|ogg|mpeg|mp3|mp4|m4a|x-m4a|wav|wave|x-wav)$/i.test(mimeType)) {
      throw new BadRequestException('Formato de audio no admitido.');
    }
    if (!file?.buffer?.length || file.size > 25 * 1024 * 1024) {
      throw new BadRequestException('El audio debe pesar menos de 25 MB.');
    }
    if (!this.firmaAudioValida(file.buffer, mimeType)) {
      throw new BadRequestException('El contenido del archivo no coincide con un audio valido.');
    }
  }

  private firmaAudioValida(buffer: Buffer, mimeType: string): boolean {
    if (/webm/i.test(mimeType)) return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (/ogg/i.test(mimeType)) return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
    if (/wav|wave/i.test(mimeType)) return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
    if (/mpeg|mp3/i.test(mimeType)) return (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'ID3') || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    if (/mp4|m4a/i.test(mimeType)) return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
    return false;
  }

  private mimeAudioPermitido(value?: string): string {
    const mimeType = String(value || '').split(';', 1)[0].toLowerCase();
    return /^audio\/(webm|ogg|mpeg|mp3|mp4|m4a|x-m4a|wav|wave|x-wav)$/.test(mimeType)
      ? mimeType
      : 'application/octet-stream';
  }

  private firmaImagenValida(buffer: Buffer, mimeType: string): boolean {
    if (/jpeg/i.test(mimeType)) {
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (/png/i.test(mimeType)) {
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (/webp/i.test(mimeType)) {
      return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    }
    return false;
  }

  private texto(value: unknown, max: number): string | undefined {
    const result = String(value ?? '').trim().slice(0, max);
    return result || undefined;
  }

  private lista(value: unknown): string[] | undefined {
    if (!value) return undefined;
    const parsed = Array.isArray(value)
      ? value
      : String(value).split(',');
    const lista = parsed.map((x) => String(x).trim().slice(0, 50)).filter(Boolean).slice(0, 20);
    return lista.length ? lista : undefined;
  }

  private numero(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
  }
}
