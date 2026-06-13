import {
  INestApplication,
  Logger,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { connect, disconnect } from 'mongoose';
import { AppModule } from './app.module';
import { DB_NAME, DB_OPTIONS, DB_URL, ENV, PORT, PREFIX_PATH, VERSION } from './env';
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
    .setTitle(`SDC API DATOS ${ENV}`)
    .setDescription('')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${PREFIX_PATH}/api`, app, document);
}

async function seedAdminIfRequested(logger: Logger) {
  const username = process.env.SEED_ADMIN_USERNAME?.toLowerCase();
  const hash = process.env.SEED_ADMIN_PASSWORD_HASH;

  if (!username || !hash) {
    return;
  }

  const connection = await connect(DB_URL, DB_OPTIONS);
  const db = connection.connection.db;
  const now = new Date();

  await db.collection('usuarios').updateOne(
    { username },
    {
      $set: {
        activo: true,
        fechaCreacion: now,
        username,
        email: username,
        hash,
        permisos: [{ nivel: 'Admin', rol: 'Admin' }],
        datosPersonales: {
          nombre: 'Admin CHAMAN2026',
          email: username,
        },
      },
    },
    { upsert: true },
  );

  await disconnect();
  logger.verbose(`Admin seed aplicado para ${username}`);
}

async function bootstrap() {
  const logger = new Logger('Main');
  logger.verbose(`Iniciando en env... ${ENV}`);
  await seedAdminIfRequested(logger);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: process.env.HTTP_BODY_LIMIT || '100mb' }));
  app.use(urlencoded({ extended: true, limit: process.env.HTTP_BODY_LIMIT || '100mb' }));
  setGlobalPrefix(app, logger);
  swaggerConfig(app);
  app.enableCors();
  app.useGlobalInterceptors(new LogRequestInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(PORT, host);
  logger.verbose(`Application listening on ${host}:${PORT}`);
  logger.verbose(`Version: ${VERSION}`);
  logger.verbose(`Documentación disponible en ${PREFIX_PATH}/api`);
}
bootstrap();
