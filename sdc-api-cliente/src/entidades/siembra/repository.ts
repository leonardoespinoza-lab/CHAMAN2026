import { Injectable } from '@nestjs/common';
import {
  ISiembra,
  IListado,
  IQueryParam,
  ICreateSiembra,
  IUpdateSiembra,
  IResultadoPrediccionMalezas,
  IRegistroFenologico,
  IRespuestaAgrometeorologiaSiembra,
} from 'modelos/src';
import { AGROMETEO_INTERNAL_TOKEN, API_CLIMA, API_DATOS } from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class SiembrasRepository {
  constructor(private axios: AxiosService) {}

  async getById(id: string): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${id}`;
    return await this.axios.GET<ISiembra>(url);
  }

  async seguimientoHuellaHidrica(id: string): Promise<any> {
    const url = `${API_DATOS}/siembras/${id}/huella-hidrica/seguimiento`;
    return await this.axios.GET<any>(url);
  }

  async agrometeorologia(
    id: string,
    desde?: string,
    hasta?: string,
  ): Promise<IRespuestaAgrometeorologiaSiembra> {
    const url = `${API_CLIMA}/agrometeorologia/siembras/${id}`;
    return await this.axios.GET<IRespuestaAgrometeorologiaSiembra>(url, {
      params: { from: desde, to: hasta },
      headers: this.agrometeorologiaHeaders(),
    });
  }

  async reprocesarAgrometeorologia(
    id: string,
    sincronizarClima = true,
  ): Promise<void> {
    const url = `${API_CLIMA}/agrometeorologia/siembras/${id}/reprocesar`;
    await this.axios.POST<void>(
      url,
      { sincronizarClima },
      { headers: this.agrometeorologiaHeaders() },
    );
  }

  private agrometeorologiaHeaders(): Record<string, string> {
    return AGROMETEO_INTERNAL_TOKEN
      ? { 'x-chaman-internal-token': AGROMETEO_INTERNAL_TOKEN }
      : {};
  }

  async prediccionMalezas(id: string): Promise<IResultadoPrediccionMalezas> {
    const url = `${API_DATOS}/siembras/${id}/prediccion-malezas`;
    return await this.axios.POST<IResultadoPrediccionMalezas>(url, {});
  }

  async get(params: IQueryParam): Promise<IListado<ISiembra>> {
    const url = `${API_DATOS}/siembras`;
    return await this.axios.GET<IListado<ISiembra>>(url, { params });
  }

  async create(data: ICreateSiembra): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras`;
    return await this.axios.POST<ISiembra>(url, data);
  }

  async update(id: string, data: IUpdateSiembra): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${id}`;
    return await this.axios.PUT<ISiembra>(url, data);
  }

  async cosechar(id: string, data: IUpdateSiembra): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/cosechar/${id}`;
    return await this.axios.PUT<ISiembra>(url, data);
  }

  async registrarEtapaFenologica(
    id: string,
    registrosFenologicos: IRegistroFenologico[],
  ): Promise<ISiembra> {
    return await this.update(id, { registrosFenologicos });
  }

  async delete(id: string): Promise<ISiembra> {
    const url = `${API_DATOS}/siembras/${id}`;
    return await this.axios.DELETE<ISiembra>(url);
  }
}
