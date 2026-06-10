import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AxiosService {
  constructor(private httpService: HttpService) {}

  public async GET<T>(
    url: string,
    options?: AxiosRequestConfig<any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, options),
      );
      return response?.data;
    } catch (error) {
      // Respuesta de error de la API
      if (error?.response?.data?.message) {
        const msgApi = error?.response?.data?.message;
        const status = error?.response?.status;
        const err = error.toJSON();
        const msg = `Error ${status} en request ${err?.config?.method} ${err?.config?.url} | ${msgApi}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status,
        );
      } else {
        // No hubo respusta de la API
        const err = error.toJSON();
        const msg = `Error ${err?.status} en request ${err?.config?.method} ${err?.config?.url} | ${err?.message}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(error?.message, err?.status || 500);
      }
    }
  }

  public async POST<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig<any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, options),
      );
      return response?.data;
    } catch (error) {
      // Respuesta de error de la API
      if (error?.response?.data?.message) {
        const msgApi = error?.response?.data?.message;
        const status = error?.response?.status;
        const err = error.toJSON();
        const msg = `Error ${status} en request ${err?.config?.method} ${err?.config?.url} | ${msgApi}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status,
        );
      } else {
        // No hubo respusta de la API
        const err = error.toJSON();
        const msg = `Error ${err?.status} en request ${err?.config?.method} ${err?.config?.url} | ${err?.message}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(error?.message, err?.status || 500);
      }
    }
  }

  public async PUT<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig<any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, data, options),
      );
      return response?.data;
    } catch (error) {
      // Respuesta de error de la API
      if (error?.response?.data?.message) {
        const msgApi = error?.response?.data?.message;
        const status = error?.response?.status;
        const err = error.toJSON();
        const msg = `Error ${status} en request ${err?.config?.method} ${err?.config?.url} | ${msgApi}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status,
        );
      } else {
        // No hubo respusta de la API
        const err = error.toJSON();
        const msg = `Error ${err?.status} en request ${err?.config?.method} ${err?.config?.url} | ${err?.message}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(error?.message, err?.status || 500);
      }
    }
  }

  public async DELETE<T>(
    url: string,
    options?: AxiosRequestConfig<any>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(url, options),
      );
      return response?.data;
    } catch (error) {
      // Respuesta de error de la API
      if (error?.response?.data?.message) {
        const msgApi = error?.response?.data?.message;
        const status = error?.response?.status;
        const err = error.toJSON();
        const msg = `Error ${status} en request ${err?.config?.method} ${err?.config?.url} | ${msgApi}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status,
        );
      } else {
        // No hubo respusta de la API
        const err = error.toJSON();
        const msg = `Error ${err?.status} en request ${err?.config?.method} ${err?.config?.url} | ${err?.message}`;
        Logger.error(msg, 'AXIOS');
        throw new HttpException(error?.message, err?.status || 500);
      }
    }
  }
}
