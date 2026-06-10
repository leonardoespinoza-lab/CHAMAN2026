import { INestApplication, Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ENV, PORT, PREFIX_PATH } from './env';
import { LogRequestInterceptor } from './auxiliares/logRequest/logRequest.interceptor';

function setGlobalPrefix(app: INestApplication, logger: Logger) {
  if (PREFIX_PATH) {
    app.setGlobalPrefix(PREFIX_PATH, {
      exclude: [{ path: '/health', method: RequestMethod.GET }],
    });
    logger.verbose(`Prefijo de ruta: /${PREFIX_PATH}.`);
  } else {
    logger.verbose('Prefijo de ruta: nada, modo local.');
  }
}

function swaggerConfig(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle(`SDC API CLIENTE ${ENV}`)
    .setDescription('')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${PREFIX_PATH}/api`, app, document);
}

async function bootstrap() {
  const logger = new Logger('Main');
  logger.verbose(`Iniciando en env... ${ENV}`);
  const app = await NestFactory.create(AppModule);
  setGlobalPrefix(app, logger);
  swaggerConfig(app);
  app.enableCors();
  app.useGlobalInterceptors(new LogRequestInterceptor());
  await app.listen(PORT);
  logger.verbose(`Application listening on port ${PORT}`);
  logger.verbose(`Documentación disponible en ${PREFIX_PATH}/api`);
}
bootstrap();
