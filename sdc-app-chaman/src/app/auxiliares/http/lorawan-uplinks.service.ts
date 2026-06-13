import { Injectable } from '@angular/core';
import { ILorawanUplink } from 'modelos/src';
import { HttpService } from './http.service';

@Injectable({
  providedIn: 'root',
})
export class LorawanUplinksService {
  constructor(private http: HttpService) {}

  public latest(params?: {
    devEUI?: string;
    applicationID?: string;
    gatewayID?: string;
    limit?: string | number;
  }): Promise<ILorawanUplink[]> {
    return this.http.get(`/lorawan/uplinks/latest`, { params });
  }
}
