import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IAsignarCamaraLotes,
  ICamara,
  ICreateCamara,
  IFoto,
  IFilter,
  ILote,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { CamarasRepository } from './repository';

@Injectable()
export class CamarasService {
  constructor(private repository: CamarasRepository) {}

  async get(query?: IQueryParam): Promise<IListado<ICamara>> {
    const response = await this.repository.getCamaras({
      limit: 0,
      sort: 'nombre',
    });
    return await this.enriquecerListado(response.datos || [], query);
  }

  async sincronizar(query?: IQueryParam): Promise<IListado<ICamara>> {
    const response = await this.repository.getHikConnectCameras();
    const camaras = (response.cameras || [])
      .map((raw) => this.normalizarCamara(raw))
      .filter((camara): camara is ICreateCamara => !!camara);

    if (camaras.length) {
      await this.repository.upsertCamaras(camaras);
    }

    return await this.get(query);
  }

  private async enriquecerListado(
    camaras: ICamara[],
    query?: IQueryParam,
  ): Promise<IListado<ICamara>> {
    const seriales = camaras.map((camara) => camara.serialCamara);
    if (!seriales.length) {
      return { datos: [], totalCount: 0 };
    }

    const [lotes, fotos] = await Promise.all([
      this.getLotesPorSeriales(seriales),
      this.getFotosPorSeriales(seriales),
    ]);

    const lotesPorSerial = new Map<string, ILote[]>();
    for (const lote of lotes) {
      const serial = this.normalizarSerial(lote.serialCamara);
      if (!serial) continue;
      const actuales = lotesPorSerial.get(serial) || [];
      actuales.push(lote);
      lotesPorSerial.set(serial, actuales);
    }

    const fotosPorSerial = new Map<string, IFoto[]>();
    for (const foto of fotos) {
      const serial = this.normalizarSerial(foto.serialCamara);
      if (!serial) continue;
      const actuales = fotosPorSerial.get(serial) || [];
      actuales.push(foto);
      fotosPorSerial.set(serial, actuales);
    }

    const datos = camaras
      .map((camara) => {
        const fotosCamara = fotosPorSerial.get(camara.serialCamara) || [];
        return {
          ...camara,
          lotes: lotesPorSerial.get(camara.serialCamara) || [],
          ultimaFoto: fotosCamara[0],
          totalFotos: fotosCamara.length,
        };
      })
      .filter((camara) =>
        query?.filter ? this.filtrarPorTexto(camara, query.filter) : true,
      )
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    return {
      datos,
      totalCount: datos.length,
    };
  }

  async getFotos(
    serialCamara: string,
    query: IQueryParam,
  ): Promise<IListado<IFoto>> {
    const serial = this.requerirSerial(serialCamara);
    const filter: IFilter<IFoto> = {
      ...(query?.filter ? JSON.parse(query.filter) : {}),
      serialCamara: serial,
    };
    return await this.repository.getFotos({
      ...query,
      filter: JSON.stringify(filter),
      sort: query?.sort || '-fechaCreacion',
    });
  }

  async getLotesDisponibles(): Promise<IListado<ILote>> {
    return await this.repository.getLotes({
      limit: 0,
      sort: 'nombre',
    });
  }

  async asignarLotes(
    serialCamara: string,
    body: IAsignarCamaraLotes,
  ): Promise<IListado<ILote>> {
    const serial = this.requerirSerial(serialCamara);
    const idsLote = Array.from(new Set((body?.idsLote || []).filter(Boolean)));
    const reemplazar = body?.reemplazar !== false;

    const actuales = await this.getLotesPorSeriales([serial]);
    const actualesIds = new Set(actuales.map((lote) => lote._id).filter(Boolean));
    const nuevosIds = new Set(idsLote);

    if (reemplazar) {
      const aDesvincular = actuales.filter(
        (lote) => lote._id && !nuevosIds.has(lote._id),
      );
      await Promise.all(
        aDesvincular.map((lote) =>
          this.repository.updateLote(lote._id!, { serialCamara: '' }),
        ),
      );
    }

    const aVincular = idsLote.filter((id) => !actualesIds.has(id));
    await Promise.all(
      aVincular.map((id) => this.repository.updateLote(id, { serialCamara: serial })),
    );

    const lotes = await this.getLotesPorSeriales([serial]);
    return {
      datos: lotes,
      totalCount: lotes.length,
    };
  }

  async capturar(serialCamara: string, canal = 1): Promise<any> {
    const serial = this.requerirSerial(serialCamara);
    return await this.repository.capturarHikConnect(serial, canal);
  }

  private async getLotesPorSeriales(seriales: string[]): Promise<ILote[]> {
    const filter: IFilter<ILote> = {
      serialCamara: { $in: seriales },
    };
    const response = await this.repository.getLotes({
      filter: JSON.stringify(filter),
      limit: 0,
      sort: 'nombre',
    });
    return response.datos || [];
  }

  private async getFotosPorSeriales(seriales: string[]): Promise<IFoto[]> {
    const filter: IFilter<IFoto> = {
      serialCamara: { $in: seriales },
    };
    const response = await this.repository.getFotos({
      filter: JSON.stringify(filter),
      limit: 300,
      sort: '-fechaCreacion',
    });
    return response.datos || [];
  }

  private normalizarCamara(raw: Record<string, any>): ICreateCamara | null {
    const devInfo = raw?.device?.devInfo || {};
    const channelInfo = raw?.device?.channelInfo || {};
    const serialCamara = this.normalizarSerial(
      devInfo.serialNo ||
        raw.serialNo ||
        raw.deviceSerial ||
        raw.serial ||
        raw.id,
    );
    if (!serialCamara) {
      return null;
    }

    return {
      serialCamara,
      nombre: raw.name || raw.deviceName || `Camara ${serialCamara}`,
      modelo: raw.model || devInfo.model || devInfo.id || devInfo.category,
      categoria: raw.category || devInfo.category,
      canal: Number(channelInfo.no || raw.channelNo || raw.channel || 1),
      online: this.normalizarOnline(raw.online),
      area: raw.area?.name || raw.areaName,
      fuente: 'hik-connect',
      fechaSincronizacion: new Date().toISOString(),
      raw,
    };
  }

  private normalizarOnline(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const texto = String(value ?? '').toLowerCase();
    return ['1', 'true', 'online', 'on'].includes(texto);
  }

  private normalizarSerial(value: unknown): string {
    return String(value || '').trim().toUpperCase();
  }

  private requerirSerial(value: unknown): string {
    const serial = this.normalizarSerial(value);
    if (!serial) {
      throw new BadRequestException('Serial de camara requerido');
    }
    return serial;
  }

  private filtrarPorTexto(camara: ICamara, filtro: string): boolean {
    let texto = '';
    try {
      const parsed = JSON.parse(filtro);
      texto = String(parsed?.search || parsed?.texto || '').toLowerCase();
    } catch {
      texto = String(filtro || '').toLowerCase();
    }
    if (!texto) return true;
    return [
      camara.nombre,
      camara.serialCamara,
      camara.modelo,
      camara.categoria,
      camara.area,
      ...(camara.lotes || []).map((lote) => lote.nombre),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(texto);
  }
}
