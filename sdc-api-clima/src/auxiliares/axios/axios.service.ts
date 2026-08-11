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
    const safeUrl = this.sanitizeUrl(url);
    if (error?.response) {
      // Respuesta de error de la API
      const status = Number(error?.response?.status) || 502;
      const remoteMessage =
        error?.response?.data?.message || error?.response?.data?.error;
      throw new HttpException(
        typeof remoteMessage === 'string'
          ? remoteMessage
          : 'El proveedor meteorologico no pudo completar la solicitud.',
        status,
      );
    } else if (error?.request) {
      // No hubo respuesta de la API
      this.logger.error(`No hubo respuesta de la API en ${method} ${safeUrl}`);
      throw new HttpException(
        'El proveedor meteorologico no respondio dentro del tiempo esperado.',
        503,
      );
    } else {
      // Error desconocido
      this.logger.error(`Error interno de integracion en ${method} ${safeUrl}`);
      throw new HttpException(
        'No se pudo completar la consulta meteorologica.',
        502,
      );
    }
  }

  private sanitizeUrl(value: string): string {
    try {
      const parsed = new URL(value);
      if (parsed.searchParams.has('apikey')) {
        parsed.searchParams.set('apikey', '[REDACTED]');
      }
      return parsed.toString();
    } catch {
      return value.replace(/([?&]apikey=)[^&\s]+/gi, '$1[REDACTED]');
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
