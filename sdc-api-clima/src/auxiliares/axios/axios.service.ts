import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { LogService } from '../logsService/service';

@Injectable()
export class AxiosService {
  private logger = new LogService(AxiosService.name);

  constructor(private httpService: HttpService) {}

  private handleError(error: any, url: string, method: string) {
    if (error?.response) {
      // Respuesta de error de la API
      throw new HttpException(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.response?.data,
        error?.response?.status,
      );
    } else if (error?.request) {
      // No hubo respuesta de la API
      this.logger.error(`No hubo respuesta de la API en ${method} ${url}`);
      throw new HttpException(error?.request?.data, error?.request?.status);
    } else {
      // Error desconocido
      this.logger.error(`Unhandled Error en ${method} ${url}`);
      console.error(error);
      throw new HttpException(error, 500);
    }
  }

  //

  public async GET<T>(url: string, options?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error, url, 'GET');
    }
  }

  public async GETWithRetry<T>(
    url: string,
    options: {
      retries?: number;
      retryDelay?: number;
      axiosConfig?: AxiosRequestConfig;
    } = {},
  ): Promise<T> {
    const { retries = 3, retryDelay = 1000, axiosConfig } = options;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.get<T>(url, axiosConfig),
        );
        return response.data; // Éxito, devuelve los datos
      } catch (error) {
        // Verifica si el error permite un reintento
        const isRetryable =
          !axios.isAxiosError(error) || // Error que no es de Axios (ej. red)
          !error.response || // No hubo respuesta del servidor
          (error.response.status >= 500 && error.response.status <= 599); // Error del servidor

        if (isRetryable && attempt < retries) {
          this.logger.warn(
            `Intento ${attempt}/${retries} falló para GET ${url}. Reintentando en ${retryDelay}ms...`,
          );
          await this.delay(retryDelay); // Espera antes del próximo intento
        } else {
          this.logger.error(
            `Todos los intentos (${attempt}) fallaron para GET ${url}.`,
          );
          // Si no es reintentable o se acabaron los intentos, lanza el error
          this.handleError(error, url, 'GET');
        }
      }
    }
    // Este throw es un fallback, en la práctica el handleError anterior ya lo haría.
    throw new HttpException(
      'No se pudo completar la solicitud después de múltiples intentos.',
      500,
    );
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
      this.handleError(error, url, 'POST');
    }
  }

  public async POST_FULL<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T, any>> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, options),
      );
      return response;
    } catch (error) {
      this.handleError(error, url, 'POST');
    }
  }

  public async PUT<T>(
    url: string,
    data: Record<string, any>,
    options?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(url, data, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error, url, 'PUT');
    }
  }

  public async DELETE<T>(
    url: string,
    options?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(url, options),
      );
      return response?.data;
    } catch (error) {
      this.handleError(error, url, 'DELETE');
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
