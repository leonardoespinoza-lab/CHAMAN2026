import { INestApplication, Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ENV, PORT, PREFIX } from './env';
import { LogRequestInterceptor } from './auxiliares/logRequest/logRequest.interceptor';
import {
  applySecurityHardening,
  shouldExposeSwagger,
} from './auxiliares/security/app-hardening';

function setGlobalPrefix(app: INestApplication, logger: Logger) {
  if (PREFIX) {
    app.setGlobalPrefix(PREFIX, {
      exclude: [{ path: '/health', method: RequestMethod.GET }],
    });
    logger.verbose(`Prefijo de ruta: /${PREFIX}.`);
  } else {
    logger.verbose('Prefijo de ruta: nada, modo local.');
  }
}

function swaggerConfig(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle(`CHAMÁN`)
    .setDescription('')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${PREFIX}/api`, app, document);
}

async function bootstrap() {
  const logger = new Logger('Main');
  logger.verbose(`Iniciando en env... ${ENV}`);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: process.env.HTTP_BODY_LIMIT || '100mb' }));
  app.use(urlencoded({ extended: true, limit: process.env.HTTP_BODY_LIMIT || '100mb' }));
  setGlobalPrefix(app, logger);
  if (shouldExposeSwagger(ENV)) {
    swaggerConfig(app);
    logger.verbose(`Documentacion disponible en ${PREFIX}/api`);
  } else {
    logger.verbose('Swagger deshabilitado en este entorno');
  }
  applySecurityHardening(app, logger, ENV);
  app.useGlobalInterceptors(new LogRequestInterceptor());
  await app.listen(PORT);
  logger.verbose(`Application listening on port ${PORT}`);
}
bootstrap();
