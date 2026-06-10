/* eslint-disable no-async-promise-executor */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import saveAs from 'file-saver';
import { IToken } from 'modelos/src';
import { firstValueFrom } from 'rxjs';
import { API } from '../../environments/environment';
import { HelperService } from '../servicios/helper';

export interface IHttpOptions {
  headers?: HttpHeaders;
  // | {
  //     [header: string]: string | string[];
  //   };
  context?: HttpContext;
  observe?: 'body';
  params?:
    | HttpParams
    | {
        [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>;
      };
  reportProgress?: boolean;
  responseType?: 'blob' | 'arraybuffer' | any;
  withCredentials?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private refreshing?: Promise<IToken>;

  constructor(
    private http: HttpClient,
    private router: Router,
    private helper: HelperService
  ) {}

  private isExpiredToken(error: any) {
    const status = error?.error?.statusCode || error?.status;
    const msg = error?.error?.message || error?.message;
    return status === 401 && msg === 'Invalid token: access token has expired';
  }

  private isInvalidToken(error: any) {
    const status = error?.error?.statusCode || error?.status;
    const msg = error?.error?.message || error?.message;
    return status === 401 && msg === 'Invalid token: access token is invalid';
  }

  private setHeaders(headers?: HttpHeaders) {
    const token = this.helper.accessToken;
    if (!token) {
      this.router.navigate(['/auth']);
    }
    headers = headers || new HttpHeaders();
    headers = headers.set('Authorization', `Bearer ${token}`);
    // Agrego el permiso
    const permiso = this.helper.numeroPermiso;
    if (permiso !== null && permiso !== undefined) {
      headers = headers.set('X-Permiso', `${permiso}`);
    }
    return headers;
  }

  private async refreshToken() {
    const refreshToken = this.helper.refreshToken;
    if (!refreshToken) {
      this.router.navigate(['/auth']);
    }
    const url = `${API}/auth/refresh_token`;
    const headers = new HttpHeaders({
      Authorization: 'Basic ' + btoa(`web:web`),
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = `refresh_token=${refreshToken}&grant_type=refresh_token`;

    const options = {
      headers,
    };

    try {
      const token = await firstValueFrom(this.http.post<IToken>(url, body, options));
      this.helper.setToken(token);
      return token;
    } catch (error) {
      this.router.navigate(['/auth']);
      throw error;
    }
  }

  //

  public async get<T>(path: string, options?: IHttpOptions): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const url = `${API}${path}`;
      options = options || {};
      options.headers = this.setHeaders(options.headers);

      try {
        const res = await firstValueFrom(this.http.get<T>(url, options));
        resolve(res);
      } catch (error: any) {
        if (this.isExpiredToken(error)) {
          if (!this.refreshing) {
            this.refreshing = this.refreshToken();
          }
          await this.refreshing;
          this.refreshing = undefined;
          try {
            options.headers = this.setHeaders(options.headers);
            const res = await firstValueFrom(this.http.get<T>(url, options));
            resolve(res);
          } catch (innerError) {
            if (!this.isExpiredToken(error)) {
              this.router.navigate(['/auth']);
            } else {
              reject(innerError);
            }
          }
        }

        if (this.isInvalidToken(error)) {
          this.router.navigate(['/auth']);
          return reject(error);
        }
        return reject(error);
      }
    });
  }

  public async delete<T>(path: string, options?: IHttpOptions): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const url = `${API}${path}`;
      options = options || {};
      options.headers = this.setHeaders(options.headers);

      try {
        const res = await firstValueFrom(this.http.delete<T>(url, options));
        resolve(res);
      } catch (error: any) {
        if (this.isExpiredToken(error)) {
          if (!this.refreshing) {
            this.refreshing = this.refreshToken();
          }
          await this.refreshing;
          this.refreshing = undefined;
          try {
            options.headers = this.setHeaders(options.headers);
            const res = await firstValueFrom(this.http.delete<T>(url, options));
            resolve(res);
          } catch (innerError) {
            if (!this.isExpiredToken(error)) {
              this.router.navigate(['/auth']);
            } else {
              reject(innerError);
            }
          }
        }

        if (this.isInvalidToken(error)) {
          this.router.navigate(['/auth']);
          return reject(error);
        }

        return reject(error);
      }
    });
  }

  public async post<T>(path: string, body: any, options?: IHttpOptions): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const url = `${API}${path}`;
      options = options || {};
      options.headers = this.setHeaders(options.headers);

      try {
        const res = await firstValueFrom(this.http.post<T>(url, body, options));
        resolve(res);
      } catch (error: any) {
        if (this.isExpiredToken(error)) {
          if (!this.refreshing) {
            this.refreshing = this.refreshToken();
          }
          await this.refreshing;
          this.refreshing = undefined;
          try {
            options.headers = this.setHeaders(options.headers);
            const res = await firstValueFrom(this.http.post<T>(url, body, options));
            resolve(res);
          } catch (innerError) {
            if (!this.isExpiredToken(error)) {
              this.router.navigate(['/auth']);
            } else {
              reject(innerError);
            }
          }
        }

        if (this.isInvalidToken(error)) {
          this.router.navigate(['/auth']);
          return reject(error);
        }

        return reject(error);
      }
    });
  }

  public async put<T>(path: string, body: any, options?: IHttpOptions): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const url = `${API}${path}`;
      options = options || {};
      options.headers = this.setHeaders(options.headers);

      try {
        const res = await firstValueFrom(this.http.put<T>(url, body, options));
        resolve(res);
      } catch (error: any) {
        if (this.isExpiredToken(error)) {
          if (!this.refreshing) {
            this.refreshing = this.refreshToken();
          }
          await this.refreshing;
          this.refreshing = undefined;
          try {
            options.headers = this.setHeaders(options.headers);
            const res = await firstValueFrom(this.http.put<T>(url, body, options));
            resolve(res);
          } catch (innerError) {
            if (!this.isExpiredToken(error)) {
              this.router.navigate(['/auth']);
            } else {
              reject(innerError);
            }
          }
        }

        if (this.isInvalidToken(error)) {
          this.router.navigate(['/auth']);
          return reject(error);
        }

        return reject(error);
      }
    });
  }

  public async getFile(path: string, options: IHttpOptions, filename: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const url = `${API}${path}`;
      options = options || {};
      options.headers = this.setHeaders(options.headers);

      try {
        const res = await this._getFile(url, options, filename);
        resolve(res);
      } catch (error: any) {
        if (this.isExpiredToken(error)) {
          if (!this.refreshing) {
            this.refreshing = this.refreshToken();
          }
          await this.refreshing;
          this.refreshing = undefined;
          try {
            options.headers = this.setHeaders(options.headers);
            const res = await this._getFile(url, options, filename);
            resolve(res);
          } catch (innerError) {
            if (!this.isExpiredToken(error)) {
              this.router.navigate(['/auth']);
            } else {
              reject(innerError);
            }
          }
        }

        if (this.isInvalidToken(error)) {
          this.router.navigate(['/auth']);
          return reject(error);
        }

        return reject(error);
      }
    });
  }

  public async _getFile(url: string, options: IHttpOptions, filename: string): Promise<void> {
    return new Promise((resolve, reject) => {
      options.responseType = 'blob';

      this.http.get(url, options).subscribe(
        (response: any) => {
          try {
            const file = new File([response], filename);
            saveAs(file);
            resolve();
          } catch (error) {
            console.error(error);
            resolve();
          }
        },
        (error: any) => {
          const reader: FileReader = new FileReader();
          reader.onloadend = () => {
            reject(JSON.parse(reader.result as string));
          };
          reader.readAsText(error?.error);
        }
      );
    });
  }
}
