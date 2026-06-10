import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheWarmingQueueService } from './cache-warming-queue.service';

@Injectable()
export class LoginCacheWarmingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoginCacheWarmingInterceptor.name);

  constructor(private readonly cacheWarmingService: CacheWarmingQueueService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(async (response) => {
        try {
          // Solo procesar si la respuesta contiene datos de usuario
          let usuario = null;

          // Detectar diferentes estructuras de respuesta
          if (response && response.usuario && response.usuario._id) {
            // Estructura: { success: true, usuario: {...} }
            usuario = response.usuario;
          } else if (response && response.user && response.user._id) {
            // Estructura OAuth: { accessToken: "...", user: {...} }
            usuario = response.user;
          }

          if (usuario && usuario._id) {
            // Verificar que el usuario tenga permisos
            if (usuario.permisos && Array.isArray(usuario.permisos)) {
              // 🔒 RESTRICCIÓN: Solo activar cache warming para productores y establecimientos
              const tienePermisoParaTiles = usuario.permisos.some((permiso) =>
                ['Productor', 'Establecimiento'].includes(permiso.nivel),
              );

              if (!tienePermisoParaTiles) {
                this.logger.debug(
                  `🚫 Usuario ${usuario._id} no es productor/establecimiento, omitiendo cache warming`,
                );
                return;
              }

              // Determinar fuente del login desde el contexto de la request
              const request = context.switchToHttp().getRequest();
              const loginSource = this.determineLoginSource(request);

              this.logger.log(
                `🔥 Activando cache warming para usuario: ${usuario._id} (${loginSource})`,
              );

              // Activar cache warming de forma asíncrona (no blocking)
              this.cacheWarmingService
                .warmTilesForUserLogin(
                  usuario._id,
                  usuario.permisos,
                  loginSource,
                )
                .catch((error) => {
                  this.logger.error(
                    `❌ Error en cache warming para usuario ${usuario._id}:`,
                    error.message,
                  );
                });
            } else {
              this.logger.debug(
                `👤 Usuario ${usuario._id} sin permisos, omitiendo cache warming`,
              );
            }
          }
        } catch (error) {
          // No queremos que errores en el cache warming afecten la respuesta del login
          this.logger.error(
            '❌ Error inesperado en interceptor de cache warming:',
            error.message,
          );
        }
      }),
    );
  }

  /**
   * Determina la fuente del login basado en la URL del endpoint
   */
  private determineLoginSource(
    request: any,
  ): 'user-login' | 'refresh-token' | 'google-login' {
    const url = request.url || '';

    if (url.includes('google-login')) {
      return 'google-login';
    } else if (url.includes('refresh-token')) {
      return 'refresh-token';
    } else {
      return 'user-login';
    }
  }
}
