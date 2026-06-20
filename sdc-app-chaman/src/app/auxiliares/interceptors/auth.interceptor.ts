import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { IToken } from 'modelos/src';
import { BehaviorSubject, from, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { LoginService } from '../http/login.service';
import { HelperService } from '../servicios/helper';

// Estado global para el refresh
let isRefreshing = false;
let refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const helper = inject(HelperService);
  const loginService = inject(LoginService);
  const router = inject(Router);

  // Agregar token a la request si existe
  const authRequest = addToken(req, helper);

  return next(authRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401: token vencido o invalido. 403: sesion valida sin permiso para una accion puntual.
      // No se debe cerrar la sesion ante un 403 porque un usuario de lectura puede disparar
      // consultas opcionales sin permisos de escritura y aun asi seguir navegando.
      if (error.status === 401 && helper.refreshToken) {
        return handle401Error(authRequest, next, helper, loginService, router);
      }

      // Si es 401 y NO tenemos refresh token, redirigir a login
      if (error.status === 401 && !helper.refreshToken) {
        helper.removeToken();
        router.navigate(['/auth']);
      }

      return throwError(() => error);
    })
  );
};

function addToken(request: HttpRequest<any>, helper: HelperService): HttpRequest<any> {
  const token = helper.accessToken;
  const headers: Record<string, string> = { 'ngrok-skip-browser-warning': 'true' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const permiso = helper.numeroPermiso;
  if (permiso !== null && permiso !== undefined) {
    headers['X-Permiso'] = `${permiso}`;
  }
  return request.clone({ setHeaders: headers });
}

function handle401Error(
  request: HttpRequest<any>,
  next: HttpHandlerFn,
  helper: HelperService,
  loginService: LoginService,
  router: Router
): Observable<HttpEvent<any>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    // Convertir Promise a Observable
    return from(loginService.refreshToken()).pipe(
      switchMap((token: IToken) => {
        isRefreshing = false;
        refreshTokenSubject.next(token.accessToken);

        // Reintentar la request original con el nuevo token
        return next(addToken(request, helper));
      }),
      catchError((error) => {
        isRefreshing = false;

        // Si el refresh falla, limpiar tokens y redirigir a login
        helper.removeToken();
        router.navigate(['/auth']);

        return throwError(() => error);
      })
    );
  } else {
    // Si ya se está refreshing, esperar a que termine
    return refreshTokenSubject.pipe(
      filter((token) => token != null),
      take(1),
      switchMap(() => next(addToken(request, helper)))
    );
  }
}
