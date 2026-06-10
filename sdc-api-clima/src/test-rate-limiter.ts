import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService } from './auxiliares/rate-limiter/rate-limiter.service';

async function testRateLimiter() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [RateLimiterService],
  }).compile();

  const rateLimiter = module.get<RateLimiterService>(RateLimiterService);

  console.log('🚀 Iniciando prueba de rate limiter...');

  // Simular múltiples solicitudes de tiles simultáneas
  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < 20; i++) {
    promises.push(
      rateLimiter.addTileRequest(
        async () => {
          console.log(`📍 Procesando tile ${i}`);
          await new Promise((resolve) => setTimeout(resolve, 100)); // Simular latencia API
          return `tile-${i}-data`;
        },
        'temperature',
        { x: i, y: i, z: 10 },
      ),
    );
  }

  console.log(`⏰ Enviadas ${promises.length} solicitudes de tiles...`);

  const results = await Promise.all(promises);
  const endTime = Date.now();

  console.log(
    `✅ Todas las solicitudes completadas en ${endTime - startTime}ms`,
  );
  console.log(`📊 Resultados: ${results.length} tiles procesados`);

  // Obtener estadísticas
  const stats = rateLimiter.getQueueStats();
  console.log('\n📈 Estadísticas del Rate Limiter:');
  console.log(`- Solicitudes en cola: ${stats.queueSize}`);
  console.log(`- Peticiones activas: ${stats.activeRequests}`);
  console.log(`- Máximo concurrente: ${stats.maxConcurrent}`);
  console.log(`- Intervalo mínimo: ${stats.minInterval}ms`);
  console.log(`- Procesando: ${stats.isProcessing}`);
  console.log(`- Contador de requests: ${stats.requestCount}`);

  module.close();
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  testRateLimiter().catch(console.error);
}

export { testRateLimiter };
