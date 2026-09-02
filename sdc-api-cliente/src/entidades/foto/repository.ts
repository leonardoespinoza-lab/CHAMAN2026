import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ICreateFoto, IFoto, ILote, IListado, IQueryParam, IUpdateFoto } from 'modelos/src';
import { API_DATOS, API_FTP, TIMELAPSE_ADMIN_TOKEN } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class FotosRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<IFoto> {
    const url = `${API_DATOS}/fotos/${id}`;
    return await this.axios.GET<IFoto>(url);
  }

  async get(filtro: IQueryParam): Promise<IListado<IFoto>> {
    const url = `${API_DATOS}/fotos`;
    return await this.axios.GET<IListado<IFoto>>(url, {
      params: filtro,
    });
  }

  async getLoteById(id: string): Promise<ILote> {
    const url = `${API_DATOS}/lotes/${id}`;
    return await this.axios.GET<ILote>(url);
  }

  async getImagen(
    foto: IFoto,
    configuredToken = TIMELAPSE_ADMIN_TOKEN,
  ): Promise<any> {
    const url = resolveStoredPhotoUrl(foto?.url);
    const privateFieldPhoto =
      foto?.fuente === 'campo' || isPrivateFieldPhotoStorageUrl(url);
    const operationalToken = privateFieldPhoto
      ? requireTimelapseAdminToken(configuredToken)
      : undefined;
    return await this.axios.GET(url, {
      responseType: 'arraybuffer',
      maxRedirects: 0,
      headers: operationalToken
        ? {
            Authorization: `Bearer ${operationalToken}`,
            'x-timelapse-token': operationalToken,
          }
        : undefined,
    });
  }

  async getAudio(
    audio: IFoto,
    configuredToken = TIMELAPSE_ADMIN_TOKEN,
  ): Promise<any> {
    const url = resolveStoredAudioUrl(audio?.url);
    const operationalToken = requireTimelapseAdminToken(configuredToken);
    return await this.axios.GET(url, {
      responseType: 'arraybuffer',
      maxRedirects: 0,
      headers: {
        Authorization: `Bearer ${operationalToken}`,
        'x-timelapse-token': operationalToken,
      },
    });
  }

  async create(data: ICreateFoto): Promise<IFoto> {
    return await this.axios.POST<IFoto>(`${API_DATOS}/fotos`, data);
  }

  async update(id: string, data: IUpdateFoto): Promise<IFoto> {
    return await this.axios.PUT<IFoto>(`${API_DATOS}/fotos/${id}`, data);
  }

  async uploadCampo(
    idLote: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<{
    publicUrl: string;
    size: number;
    contentType: string;
    fechaCaptura: string;
  }> {
    const operationalToken = requireTimelapseAdminToken();
    return await this.axios.POST(
      `${API_FTP}/field-photos/upload/${encodeURIComponent(idLote)}`,
      file.buffer,
      {
        headers: {
          Authorization: `Bearer ${operationalToken}`,
          'x-timelapse-token': operationalToken,
          'Content-Type': file.mimetype,
          'Content-Length': String(file.buffer.length),
          'x-original-name': encodeURIComponent(file.originalname || 'foto-campo.jpg'),
        },
        maxBodyLength: 12 * 1024 * 1024,
        timeout: 30000,
      },
    );
  }

  async uploadAudio(
    idLote: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<{
    publicUrl: string;
    size: number;
    contentType: string;
    fechaCaptura: string;
  }> {
    const operationalToken = requireTimelapseAdminToken();
    return await this.axios.POST(
      `${API_FTP}/field-audio/upload/${encodeURIComponent(idLote)}`,
      file.buffer,
      {
        headers: {
          Authorization: `Bearer ${operationalToken}`,
          'x-timelapse-token': operationalToken,
          'Content-Type': file.mimetype,
          'Content-Length': String(file.buffer.length),
          'x-original-name': encodeURIComponent(file.originalname || 'audio-campo.webm'),
        },
        maxBodyLength: 25 * 1024 * 1024,
        timeout: 30000,
      },
    );
  }

  async delete(id: string): Promise<IFoto> {
    const url = `${API_DATOS}/fotos/${id}`;
    return await this.axios.DELETE<IFoto>(url);
  }
}

export function requireTimelapseAdminToken(
  token = TIMELAPSE_ADMIN_TOKEN,
): string {
  const value = String(token || '').trim();
  if (!value) {
    throw new ServiceUnavailableException(
      'El almacenamiento fotografico no tiene configurado su token operativo.',
    );
  }
  return value;
}

/**
 * Converts a persisted photo path into a request to the configured image
 * service. The host contained in the stored value is deliberately ignored:
 * historical records may point to an old public hostname, but the backend
 * must only contact the currently configured and trusted API_FTP origin.
 */
export function resolveStoredPhotoUrl(
  storedUrl: string | undefined,
  trustedBase = API_FTP,
): string {
  const raw = String(storedUrl || '').trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new BadRequestException('La foto no tiene una ubicacion valida.');
  }

  let base: URL;
  let stored: URL;
  try {
    base = new URL(trustedBase);
    stored = new URL(raw, base);
  } catch {
    throw new BadRequestException('La foto no tiene una ubicacion valida.');
  }

  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    !['http:', 'https:'].includes(stored.protocol) ||
    stored.username ||
    stored.password ||
    stored.search ||
    stored.hash
  ) {
    throw new BadRequestException('La fuente de la foto no esta permitida.');
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(stored.pathname);
  } catch {
    throw new BadRequestException('La foto no tiene una ruta valida.');
  }
  const segments = decodedPath.split('/');
  if (
    !decodedPath.startsWith('/imagenes/') ||
    !/^\/imagenes\/[A-Za-z0-9._/-]+\.(jpe?g|png|webp)$/i.test(decodedPath) ||
    decodedPath.includes('\\') ||
    segments.slice(2).some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new BadRequestException('La fuente de la foto no esta permitida.');
  }

  const target = new URL(decodedPath, `${base.origin}/`);
  return target.toString();
}

export function isPrivateFieldPhotoStorageUrl(value: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(value, 'https://storage.invalid').pathname;
  } catch {
    return false;
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const segments = pathname.split('/').filter(Boolean);
  return (
    segments[0]?.toLowerCase() === 'imagenes' &&
    segments[1]?.toLowerCase() === 'campo'
  );
}

export function resolveStoredAudioUrl(
  storedUrl: string | undefined,
  trustedBase = API_FTP,
): string {
  const raw = String(storedUrl || '').trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new BadRequestException('El audio no tiene una ubicacion valida.');
  }
  let base: URL;
  let stored: URL;
  try {
    base = new URL(trustedBase);
    stored = new URL(raw, base);
  } catch {
    throw new BadRequestException('El audio no tiene una ubicacion valida.');
  }
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    !['http:', 'https:'].includes(stored.protocol) ||
    stored.username ||
    stored.password ||
    stored.search ||
    stored.hash
  ) {
    throw new BadRequestException('La fuente del audio no esta permitida.');
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(stored.pathname);
  } catch {
    throw new BadRequestException('El audio no tiene una ruta valida.');
  }
  const segments = decodedPath.split('/');
  if (
    !decodedPath.startsWith('/audios/AUDIO-CAMPO/') ||
    !/^\/audios\/AUDIO-CAMPO\/[A-Za-z0-9._/-]+\.(webm|ogg|oga|mp3|m4a|mp4|wav)$/i.test(decodedPath) ||
    decodedPath.includes('\\') ||
    segments.slice(2).some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new BadRequestException('La fuente del audio no esta permitida.');
  }
  return new URL(decodedPath, `${base.origin}/`).toString();
}
