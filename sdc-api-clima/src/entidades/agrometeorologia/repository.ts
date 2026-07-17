import { Injectable } from '@nestjs/common';
import {
  ICreateIndicadorAgrometeorologico,
  ICreateObservacionMeteorologica,
  IDispositivo,
  IEstablecimiento,
  IIndicadorAgrometeorologicoDiario,
  IListado,
  ILote,
  IObservacionMeteorologicaNormalizada,
  IQueryParam,
  IReporte,
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

  getDispositivos(params: IQueryParam): Promise<IListado<IDispositivo>> {
    return this.axios.GET<IListado<IDispositivo>>(
      `${API_DATOS}/dispositivos`,
      { params, headers: this.internalHeaders() },
    );
  }

  getReportes(params: IQueryParam): Promise<IListado<IReporte>> {
    return this.axios.GET<IListado<IReporte>>(`${API_DATOS}/reportes`, {
      params,
      headers: this.internalHeaders(),
    });
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

  replaceIndicadoresGeneration(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
    indicadores: ICreateIndicadorAgrometeorologico[],
    intervaloEsperado: {
      desde: string;
      hasta: string;
      cantidad: number;
      checksumFechas: string;
    },
  ) {
    return this.axios.POST(
      `${API_DATOS}/indicadores-agrometeorologicos/generaciones/reemplazar`,
      {
        idSiembra,
        versionCalculo,
        generacionCalculo,
        indicadores,
        intervaloEsperado,
      },
      { headers: this.internalHeaders() },
    );
  }

  acquireIndicadoresGenerationLease(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
  ): Promise<{ previousGeneration?: string; leaseUntil: string }> {
    return this.axios.POST(
      `${API_DATOS}/indicadores-agrometeorologicos/generaciones/lease/adquirir`,
      { idSiembra, versionCalculo, generacionCalculo },
      { headers: this.internalHeaders() },
    );
  }

  releaseIndicadoresGenerationLease(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
  ): Promise<void> {
    return this.axios.POST(
      `${API_DATOS}/indicadores-agrometeorologicos/generaciones/lease/liberar`,
      { idSiembra, versionCalculo, generacionCalculo },
      { headers: this.internalHeaders() },
    );
  }

  getActiveIndicadoresGeneration(
    idSiembra: string,
    versionCalculo: string,
  ): Promise<{
    generationId?: string;
    activatedAt?: string;
    data: IIndicadorAgrometeorologicoDiario[];
  }> {
    return this.axios.GET(
      `${API_DATOS}/indicadores-agrometeorologicos/generaciones/activa/${idSiembra}/${encodeURIComponent(versionCalculo)}`,
      { headers: this.internalHeaders() },
    );
  }

  private internalHeaders(): Record<string, string> {
    return AGROMETEO_INTERNAL_TOKEN
      ? { 'x-chaman-internal-token': AGROMETEO_INTERNAL_TOKEN }
      : {};
  }
}
