import { INestApplication, Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
    .setTitle(`CHAMÁN API LORA`)
    .setDescription('')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${PREFIX}/api`, app, document);
}

async function bootstrap() {
  const logger = new Logger('Main');
  logger.verbose(`Iniciando en env... ${ENV}`);
  const app = await NestFactory.create(AppModule);
  setGlobalPrefix(app, logger);
  if (shouldExposeSwagger(ENV)) {
    swaggerConfig(app);
  } else {
    logger.verbose('Swagger deshabilitado en este entorno');
  }
  applySecurityHardening(app, logger, ENV);
  app.useGlobalInterceptors(new LogRequestInterceptor());
  await app.listen(PORT);
  logger.verbose(`Application listening on port ${PORT}`);
}
bootstrap();
