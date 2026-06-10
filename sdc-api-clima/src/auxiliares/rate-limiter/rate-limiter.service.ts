import { Injectable, Logger } from '@nestjs/common';

interface QueuedRequest {
  id: string;
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: number;
  createdAt: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private readonly minInterval: number;
  private readonly maxConcurrent: number;
  private activeRequests = 0;
  private lastRequestTime = 0;
  private requestCount = 0;
  private windowStart = Date.now();

  constructor() {
    // Plan Standard: 250 requests/minuto
    // Ser conservadores: 200 requests/minuto para margen de seguridad
    this.minInterval = (60 * 1000) / 200; // 300ms entre requests
    this.maxConcurrent = 8; // Máximo 8 requests simultáneos

    this.logger.log(
      `Rate Limiter configurado: 200 req/min, ${this.maxConcurrent} concurrent`,
    );
  }

  /**
   * Agrega una función a la cola con rate limiting
   */
  async add<T>(
    fn: () => Promise<T>,
    priority: number = 5,
    context?: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: this.generateRequestId(),
        fn,
        resolve,
        reject,
        priority,
        createdAt: Date.now(),
      };

      // Insertar en la cola manteniendo orden de prioridad
      this.insertByPriority(request);

      if (context) {
        this.logger.debug(
          `Request encolado: ${context} (priority: ${priority}, queue size: ${this.queue.length})`,
        );
      }

      // Iniciar procesamiento si no está activo
      this.process();
    });
  }

  /**
   * Versión específica para tiles de Meteosource con prioridad alta
   */
  async addTileRequest<T>(
    fn: () => Promise<T>,
    variable: string,
    coordinates: { x: number; y: number; z: number },
  ): Promise<T> {
    const context = `Tile ${variable} [${coordinates.x},${coordinates.y},${coordinates.z}]`;
    return this.add(fn, 1, context); // Prioridad alta para tiles
  }

  /**
   * Versión para requests de clima general con prioridad normal
   */
  async addClimateRequest<T>(
    fn: () => Promise<T>,
    lat: number,
    lng: number,
  ): Promise<T> {
    const context = `Climate request [${lat},${lng}]`;
    return this.add(fn, 5, context); // Prioridad normal
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (
        this.queue.length > 0 &&
        this.activeRequests < this.maxConcurrent
      ) {
        const request = this.queue.shift()!;
        this.activeRequests++;

        // Verificar rate limit local (sin Redis por ahora)
        const canProceed = await this.checkRateLimit();

        if (!canProceed) {
          // Re-encolar el request si se excede el rate limit
          this.queue.unshift(request);
          this.activeRequests--;

          // Esperar antes de reintentar
          setTimeout(() => this.process(), this.minInterval);
          break;
        }

        // Procesar request de forma asíncrona
        this.processRequest(request);
      }
    } catch (error) {
      this.logger.error('Error en el procesamiento de la cola:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processRequest(request: QueuedRequest): Promise<void> {
    try {
      const startTime = Date.now();
      const result = await request.fn();
      const duration = Date.now() - startTime;

      this.logger.debug(`Request ${request.id} completado en ${duration}ms`);
      request.resolve(result);
    } catch (error) {
      this.logger.warn(`Request ${request.id} falló:`, error.message);

      // Reintentar en caso de error 429 (rate limit)
      if (error.status === 429) {
        const retryDelay = this.calculateRetryDelay();
        this.logger.warn(
          `Rate limit hit, reintentando request ${request.id} en ${retryDelay}ms`,
        );

        setTimeout(() => {
          this.queue.unshift(request); // Re-encolar con prioridad
          this.process();
        }, retryDelay);
      } else {
        request.reject(error);
      }
    } finally {
      this.activeRequests--;

      // Continuar procesando después de un delay mínimo
      setTimeout(() => this.process(), this.minInterval);
    }
  }

  private async checkRateLimit(): Promise<boolean> {
    const now = Date.now();
    const windowSize = 60 * 1000; // 1 minuto
    const limit = 200; // 200 requests por minuto

    // Resetear contador si ha pasado la ventana
    if (now - this.windowStart >= windowSize) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Verificar si se puede hacer el request
    if (this.requestCount >= limit) {
      this.logger.warn(
        `Rate limit alcanzado: ${this.requestCount}/${limit} requests en ventana actual`,
      );
      return false;
    }

    // Verificar intervalo mínimo entre requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      return false;
    }

    // Actualizar contadores
    this.requestCount++;
    this.lastRequestTime = now;

    return true;
  }

  private calculateRetryDelay(): number {
    // Exponential backoff con jitter para 429s
    const baseDelay = 2000; // 2 segundos base
    const jitter = Math.random() * 1000; // 0-1 segundo de jitter
    return baseDelay + jitter;
  }

  private insertByPriority(request: QueuedRequest): void {
    let insertIndex = this.queue.length;

    // Encontrar posición basada en prioridad (menor número = mayor prioridad)
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority > request.priority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, request);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  /**
   * Obtiene estadísticas de la cola para monitoreo
   */
  getQueueStats() {
    return {
      queueSize: this.queue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
      minInterval: this.minInterval,
      isProcessing: this.isProcessing,
      requestCount: this.requestCount,
      windowStart: this.windowStart,
    };
  }

  /**
   * Limpia la cola (para testing o emergencias)
   */
  clearQueue(): void {
    this.queue.forEach((request) => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    this.logger.warn('Cola de rate limiting limpiada');
  }

  /**
   * Método utilitario para crear delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
