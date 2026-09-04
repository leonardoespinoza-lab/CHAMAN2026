import { Injectable } from '@angular/core';
import {
  ICargaFitosanitaria,
  ILote,
  ICreateLote,
  IListado,
  IQueryParam,
  IUbicacionAdministrativaLote,
  IUpdateLote,
  IInteligenciaSueloLote,
  IEntradasAgronomicasSuelo,
  IResultadoPrediccionMalezas,
} from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class LoteService {
  private readonly soilAssessmentCache = new Map<string, { expiresAt: number; value: IInteligenciaSueloLote | null }>();
  private readonly soilAssessmentPending = new Map<string, Promise<IInteligenciaSueloLote | null>>();
  private readonly soilAssessmentGeneration = new Map<string, number>();

  constructor(private http: HttpService) {}

  public listar(params?: IQueryParam): Promise<IListado<ILote>> {
    // let params = HelperService.getQueryParams(queryParams);
    return this.http.get(`/lotes`, { params });
  }

  public crear(dato: ICreateLote): Promise<ILote> {
    return this.http.post(`/lotes`, dato);
  }

  public listarPorId(id: string): Promise<ILote> {
    return this.http.get(`/lotes/${id}`);
  }

  public certificado(id: string, filename: string): Promise<void> {
    return this.http.getFile(`/lotes/${id}/certificado`, {}, filename);
  }

  public cargaFitosanitaria(id: string): Promise<ICargaFitosanitaria> {
    return this.http.get(`/lotes/${id}/carga-fitosanitaria`);
  }

  public ubicacionAdministrativa(id: string): Promise<IUbicacionAdministrativaLote | null> {
    return this.http.get(`/lotes/${id}/ubicacion`);
  }

  public reprocesarUbicacionAdministrativa(id: string, force = true): Promise<IUbicacionAdministrativaLote> {
    return this.http.post(`/lotes/${id}/ubicacion/reprocesar`, {}, { params: { force } });
  }

  public sueloAmbiente(id: string): Promise<IInteligenciaSueloLote | null> {
    const cached = this.soilAssessmentCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }
    const pending = this.soilAssessmentPending.get(id);
    if (pending) return pending;

    const generation = this.soilAssessmentGeneration.get(id) || 0;
    const rawRequest = this.http
      .get<IInteligenciaSueloLote | null>(`/lotes/${id}/suelo-ambiente`)
      .then((assessment) => {
        if (
          (this.soilAssessmentGeneration.get(id) || 0) === generation &&
          assessment &&
          ['ready', 'partial', 'no_coverage'].includes(assessment.status)
        ) {
          this.soilAssessmentCache.set(id, {
            expiresAt: Date.now() + 5 * 60_000,
            value: assessment,
          });
        }
        return assessment;
      });
    const request = rawRequest.finally(() => {
      if (this.soilAssessmentPending.get(id) === request) {
        this.soilAssessmentPending.delete(id);
      }
    });
    this.soilAssessmentPending.set(id, request);
    return request;
  }

  public entradasAgronomicasSuelo(id: string): Promise<IEntradasAgronomicasSuelo | null> {
    return this.http.get(`/lotes/${id}/entradas-agronomicas-suelo`);
  }

  public reprocesarSueloAmbiente(id: string): Promise<IInteligenciaSueloLote> {
    this.invalidateSoilAssessment(id);
    return this.http.post(`/lotes/${id}/suelo-ambiente/reprocesar`, {});
  }

  public sueloInta(lat: number, lng: number): Promise<any> {
    return this.http.get(`/lotes/suelo-inta`, { params: { lat, lng } });
  }

  public generarNdvi(id: string): Promise<{
    encolado: boolean;
    mensaje: string;
    ultimaFechaImagen?: string | null;
  }> {
    return this.http.post(`/lotes/${id}/ndvi`, {});
  }

  public generarPrediccionMalezas(id: string, reiniciarSeguimiento = false): Promise<IResultadoPrediccionMalezas> {
    return this.http.post(`/lotes/${id}/prediccion-malezas`, {
      reiniciarSeguimiento,
    });
  }

  public editar(id: string, dato: IUpdateLote): Promise<ILote> {
    this.invalidateSoilAssessment(id);
    return this.http.put(`/lotes/${id}`, dato);
  }

  public eliminar(id: string): Promise<void> {
    return this.http.delete(`/lotes/${id}`);
  }

  private invalidateSoilAssessment(id: string): void {
    this.soilAssessmentGeneration.set(id, (this.soilAssessmentGeneration.get(id) || 0) + 1);
    this.soilAssessmentCache.delete(id);
    this.soilAssessmentPending.delete(id);
  }
}
