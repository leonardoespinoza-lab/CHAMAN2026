import { INestApplication, Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ENV, PORT, PREFIX_PATH } from './env';
import { LogRequestInterceptor } from './auxiliares/logRequest/logRequest.interceptor';
import {
  applySecurityHardening,
  shouldExposeSwagger,
} from './auxiliares/security/app-hardening';

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
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // El catálogo completo (hasta 2.000 variedades) supera los 100 KB del
  // parser por defecto. Se mantiene un límite acotado y configurable para no
  // ampliar innecesariamente la superficie del resto de la API.
  const bodyLimit = process.env.HTTP_BODY_LIMIT || '2mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  setGlobalPrefix(app, logger);
  if (shouldExposeSwagger(ENV)) {
    swaggerConfig(app);
    logger.verbose(`Documentacion disponible en ${PREFIX_PATH}/api`);
  } else {
    logger.verbose('Swagger deshabilitado en este entorno');
  }
  applySecurityHardening(app, logger, ENV);
  app.useGlobalInterceptors(new LogRequestInterceptor());
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(PORT, host);
  logger.verbose(`Application listening on ${host}:${PORT}`);
}
bootstrap();
