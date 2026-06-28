import { Injectable } from '@angular/core';
import { INapaReferenciaLote } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class NapasService {
  constructor(private http: HttpService) {}

  public referenciaTerritorial(lat: number, lng: number, radioKm = 80): Promise<INapaReferenciaLote> {
    return this.http.get('/napas/referencia', {
      params: { lat, lng, radioKm },
    });
  }
}
