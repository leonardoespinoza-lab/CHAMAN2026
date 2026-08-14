import { Injectable } from '@angular/core';
import { ILorawanRawFrame, ILorawanUplink } from 'modelos/src';
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

  public latestByDevice(limit = 1000): Promise<ILorawanUplink[]> {
    return this.http.get(`/lorawan/uplinks/latest-devices`, {
      params: { limit },
    });
  }

  public rawHistory(devEUI: string, days = 7, limit = 5000): Promise<ILorawanRawFrame[]> {
    return this.http.get(`/lorawan/uplinks/raw-history/${encodeURIComponent(devEUI)}`, {
      params: { days, limit },
    });
  }
}
