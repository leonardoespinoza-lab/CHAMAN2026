import { Injectable } from '@nestjs/common';
import {
  ICreateIndicadorAgrometeorologico,
  ICreateObservacionMeteorologica,
  IEstablecimiento,
  IIndicadorAgrometeorologicoDiario,
  IListado,
  ILote,
  IObservacionMeteorologicaNormalizada,
  IQueryParam,
  ISiembra,
  IEntradasAgronomicasSuelo,
} from 'modelos/src';
import {
  AGROMETEO_INTERNAL_TOKEN,
  API_DATOS,
  SOIL_INTELLIGENCE_INTERNAL_TOKEN,
} from '../../env';
import { AxiosService } from '../../auxiliares/axios/axios.service';

@Injectable()
export class AgrometeorologiaRepository {
  constructor(private axios: AxiosService) {}

  getSiembra(id: string): Promise<ISiembra> {
    return this.axios.GET<ISiembra>(`${API_DATOS}/siembras/${id}`);
  }

  getSiembras(params: IQueryParam): Promise<IListado<ISiembra>> {
    return this.axios.GET<IListado<ISiembra>>(`${API_DATOS}/siembras`, {
      params,
    });
  }

  getEstablecimiento(id: string): Promise<IEstablecimiento> {
    return this.axios.GET<IEstablecimiento>(
      `${API_DATOS}/establecimientos/${id}`,
    );
  }

  getLote(id: string): Promise<ILote> {
    return this.axios.GET<ILote>(`${API_DATOS}/lotes/${id}`);
  }

  getSoilAgronomicInputs(
    id: string,
  ): Promise<IEntradasAgronomicasSuelo | null> {
    return this.axios.GET<IEntradasAgronomicasSuelo | null>(
      `${API_DATOS}/soil-intelligence/lots/${id}/agronomic-inputs`,
      {
        headers: SOIL_INTELLIGENCE_INTERNAL_TOKEN
          ? { 'x-chaman-internal-token': SOIL_INTELLIGENCE_INTERNAL_TOKEN }
          : {},
      },
    );
  }

  getObservaciones(
    params: IQueryParam,
  ): Promise<IListado<IObservacionMeteorologicaNormalizada>> {
    return this.axios.GET<IListado<IObservacionMeteorologicaNormalizada>>(
      `${API_DATOS}/observaciones-meteorologicas`,
      { params, headers: this.internalHeaders() },
    );
  }

  upsertObservaciones(data: ICreateObservacionMeteorologica[]) {
    return this.axios.POST(
      `${API_DATOS}/observaciones-meteorologicas/upsert/many`,
      data,
      { headers: this.internalHeaders() },
    );
  }

  getIndicadores(
    params: IQueryParam,
  ): Promise<IListado<IIndicadorAgrometeorologicoDiario>> {
    return this.axios.GET<IListado<IIndicadorAgrometeorologicoDiario>>(
      `${API_DATOS}/indicadores-agrometeorologicos`,
      { params, headers: this.internalHeaders() },
    );
  }

  upsertIndicadores(data: ICreateIndicadorAgrometeorologico[]) {
    return this.axios.POST(
      `${API_DATOS}/indicadores-agrometeorologicos/upsert/many`,
      data,
      { headers: this.internalHeaders() },
    );
  }

  deleteIndicadoresSiembra(idSiembra: string) {
    return this.axios.DELETE(
      `${API_DATOS}/indicadores-agrometeorologicos/siembra/${idSiembra}`,
      { headers: this.internalHeaders() },
    );
  }

  private internalHeaders(): Record<string, string> {
    return AGROMETEO_INTERNAL_TOKEN
      ? { 'x-chaman-internal-token': AGROMETEO_INTERNAL_TOKEN }
      : {};
  }
}
