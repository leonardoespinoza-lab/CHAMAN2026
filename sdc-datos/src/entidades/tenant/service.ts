import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ICreateTenant,
  IQueryParam,
  ISolicitudArchivado,
  IUpdateTenant,
} from 'modelos/src';
import { TenantsRepository } from './repository';

@Injectable()
export class TenantsService {
  constructor(private readonly repository: TenantsRepository) {}

  get(query: IQueryParam) {
    return this.repository.get(query);
  }

  async getById(id: string) {
    const tenant = await this.repository.getById(id);
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  async getBySlug(slug: string) {
    const tenant = await this.repository.getBySlug(this.slug(slug));
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  async create(data: ICreateTenant) {
    const slug = this.slug(data.slug || data.nombre || '');
    if (!slug) throw new BadRequestException('El slug del tenant es obligatorio');
    if (await this.repository.getBySlug(slug)) {
      throw new BadRequestException('Ya existe un tenant con ese slug');
    }
    const { administrador: _administrador, ...persistible } = data;
    return this.repository.create({
      ...persistible,
      slug,
      nombre: String(data.nombre || '').trim(),
      dominios: this.dominios(data.dominios),
      estado: data.estado || 'borrador',
    });
  }

  async update(id: string, data: IUpdateTenant) {
    await this.getById(id);
    const payload = { ...data };
    if (data.slug !== undefined) payload.slug = this.slug(data.slug);
    if (data.dominios !== undefined) payload.dominios = this.dominios(data.dominios);
    return this.repository.update(id, payload);
  }

  async archive(id: string, audit: ISolicitudArchivado) {
    await this.getById(id);
    return this.repository.archive(id, audit);
  }

  async areAllActive(ids: string[]): Promise<boolean> {
    const uniqueIds = Array.from(
      new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    if (!uniqueIds.length) return true;
    return (
      (await this.repository.countActiveByIds(uniqueIds)) === uniqueIds.length
    );
  }

  private slug(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63);
  }

  private dominios(values?: string[]): string[] | undefined {
    const normalizados = Array.from(
      new Set(
        (values || [])
          .map((value) =>
            String(value || '')
              .trim()
              .toLowerCase()
              .replace(/^https?:\/\//, '')
              .replace(/\/.*$/, ''),
          )
          .filter(Boolean),
      ),
    );
    return normalizados.length ? normalizados : undefined;
  }
}
