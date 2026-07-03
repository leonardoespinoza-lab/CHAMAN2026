import { Injectable } from '@nestjs/common';
import {
  API_METEOBLUE,
  METEOBLUE_API_KEY,
  METEOBLUE_DAILY_PACKAGE,
} from '../../env';
import { ICoordenadas } from 'modelos/src';

export interface IMeteoblueDailyResponse {
  metadata?: Record<string, unknown>;
  units?: Record<string, string>;
  data_day?: Record<string, unknown[]>;
}

@Injectable()
export class MeteoblueRepository {
  public isConfigured(): boolean {
    return !!METEOBLUE_API_KEY;
  }

  public async getDailyForecast(
    ubicacion: ICoordenadas,
    dias: number = 7,
  ): Promise<IMeteoblueDailyResponse | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const url = new URL(`${API_METEOBLUE}/${METEOBLUE_DAILY_PACKAGE}`);
    url.searchParams.set('lat', `${ubicacion.lat}`);
    url.searchParams.set('lon', `${ubicacion.lng}`);
    url.searchParams.set('apikey', METEOBLUE_API_KEY);
    url.searchParams.set('format', 'json');
    url.searchParams.set('tz', 'UTC');
    url.searchParams.set('forecast_days', `${Math.max(1, Math.min(14, dias))}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Meteoblue ${METEOBLUE_DAILY_PACKAGE} respondio ${response.status}`,
      );
    }

    return (await response.json()) as IMeteoblueDailyResponse;
  }

  public async checkApi(): Promise<{ enabled: boolean; ok: boolean }> {
    if (!this.isConfigured()) {
      return { enabled: false, ok: false };
    }

    await this.getDailyForecast({ lat: -34.6037, lng: -58.3816 }, 1);
    return { enabled: true, ok: true };
  }
}
