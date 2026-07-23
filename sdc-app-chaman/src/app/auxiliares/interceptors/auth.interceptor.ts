import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { IToken } from 'modelos/src';
import { BehaviorSubject, from, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { LoginService } from '../http/login.service';
import { HelperService } from '../servicios/helper';
import { COOKIE_AUTH } from '../../environments/environment';

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
  const requestEpoch = loginService.sessionEpoch;

  // Agregar token a la request si existe
  const authRequest = addToken(req, helper);
  const authLifecycleRequest = /\/auth\/(login|refresh_token|logout)$/.test(req.url.split('?')[0]);

  return next(authRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      // Una respuesta de la identidad anterior no puede refrescar, limpiar ni
      // redirigir la sesión que acaba de iniciar otro usuario.
      if (error.status === 401 && requestEpoch !== loginService.sessionEpoch) {
        return throwError(() => error);
      }

      // 401: token vencido o invalido. 403: sesion valida sin permiso para una accion puntual.
      // No se debe cerrar la sesion ante un 403 porque un usuario de lectura puede disparar
      // consultas opcionales sin permisos de escritura y aun asi seguir navegando.
      const hasRenewableSession = COOKIE_AUTH
        ? !!helper.token
        : !!helper.refreshToken;
      if (
        error.status === 401 &&
        hasRenewableSession &&
        !loginService.isChangingIdentity &&
        !authLifecycleRequest
      ) {
        return handle401Error(authRequest, next, helper, loginService, router);
      }

      // Si es 401 y NO tenemos refresh token, redirigir a login
      if (
        error.status === 401 &&
        (!hasRenewableSession || authLifecycleRequest) &&
        !loginService.isChangingIdentity
      ) {
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
  if (COOKIE_AUTH) {
    headers['X-Chaman-Session'] = 'cookie-v1';
    if (helper.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      headers['X-CSRF-Token'] = helper.csrfToken;
    }
  }
  const permiso = helper.numeroPermiso;
  if (permiso !== null && permiso !== undefined) {
    headers['X-Permiso'] = `${permiso}`;
  }
  return request.clone({
    setHeaders: headers,
    withCredentials: COOKIE_AUTH || request.withCredentials,
  });
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
