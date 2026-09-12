import {
  Controller,
  Get,
  Injectable,
  MiddlewareConsumer,
  Module,
  NestMiddleware,
  NestModule,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { IntegrationGuard } from './guard';
import { IntegrationsController } from './controller';
import { IntegrationsService } from './service';
import { IntegrationRegistry } from './registry';
import { IntegrationRuntime } from './runtime';
import { INTEGRATION_ROUTES, hash } from './contract';
import { UsuariosRepository } from '../entidades/usuario/repository';
import { LicenciaPorEntidadsService } from '../entidades/licenciaPorEntidad/service';
import { AdvisorScopeService } from '../auxiliares/authorization/advisor-scope.service';
import { requestBodyForLog } from '../auxiliares/logRequest/logRequest.interceptor';

@Injectable()
class PersonalLoginMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    if (req.headers.authorization !== 'Bearer personal-fixture')
      throw new UnauthorizedException();
    next();
  }
}
@Controller('usuarios')
class PersonalController {
  @Get() list() {
    return { private: true };
  }
}
@Module({
  controllers: [IntegrationsController, PersonalController],
  providers: [
    IntegrationGuard,
    Reflector,
    IntegrationRegistry,
    IntegrationRuntime,
    { provide: IntegrationsService, useValue: {} },
    { provide: UsuariosRepository, useValue: {} },
    { provide: LicenciaPorEntidadsService, useValue: {} },
    { provide: AdvisorScopeService, useValue: {} },
  ],
})
class HttpFixtureModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PersonalLoginMiddleware)
      .exclude(...INTEGRATION_ROUTES)
      .forRoutes('*');
  }
}

describe('Integration HTTP security boundary', () => {
  const oldEnv = { ...process.env };
  const key = 'chm_test_key_fixture.' + 'a'.repeat(43);
  let app: any;
  let users: any;
  let service: any;
  let license: any;
  beforeEach(async () => {
    process.env.ENV = 'testing';
    process.env.CHAMAN_INTEGRATIONS_ENABLED = 'true';
    process.env.CHAMAN_INTEGRATIONS_CLIENTS = JSON.stringify([
      {
        id: 'fixture',
        name: 'Fixture',
        advisorUserId: 'a'.repeat(24),
        permissionIndex: 0,
        enabled: true,
        expiresAt: '2099-01-01',
        requestsPerMinute: 60,
        keys: [
          { id: 'key_fixture', sha256: hash(key), expiresAt: '2099-01-01' },
        ],
        scopes: ['estructura:leer', 'fenologia:leer', 'catalogos:leer'],
      },
    ]);
    users = {
      getById: jest.fn(async () => ({
        _id: 'a'.repeat(24),
        activo: true,
        permisos: [{ nivel: 'Asesor', rol: 'Admin' }],
      })),
    };
    license = {
      getLicenciaEfectivaPorPermiso: jest.fn(async () => ({
        _id: 'b'.repeat(24),
      })),
    };
    service = {
      get: jest.fn(async (kind, id) => ({ tipo: kind, idExterno: id })),
      create: jest.fn(),
      phenology: jest.fn(async () => ({
        estado: 'disponible',
        etapa: 'Hoja bandera',
        revision: 'stable',
      })),
      catalog: jest.fn(async () => ({ datos: [] })),
    };
    const fixture = await Test.createTestingModule({
      imports: [HttpFixtureModule],
    })
      .overrideProvider(IntegrationsService)
      .useValue(service)
      .overrideProvider(UsuariosRepository)
      .useValue(users)
      .overrideProvider(LicenciaPorEntidadsService)
      .useValue(license)
      .overrideProvider(AdvisorScopeService)
      .useValue({
        enrichPermission: jest.fn(async (permission, id) => {
          permission.idAsesor = id;
        }),
      })
      .overrideProvider(IntegrationRuntime)
      .useValue({ rateLimit: jest.fn(async () => {}) })
      .compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('sdc-quimica-test');
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    process.env = { ...oldEnv };
  });
  const base = '/sdc-quimica-test/integraciones/v1';
  test('integration credentials cannot access the app, and personal credentials cannot access integrations', async () => {
    await request(app.getHttpServer())
      .get('/sdc-quimica-test/usuarios')
      .set('x-api-key', key)
      .expect(401);
    await request(app.getHttpServer())
      .get(base + '/servicios')
      .set('Authorization', 'Bearer personal-fixture')
      .expect(401);
    await request(app.getHttpServer())
      .get(base + '/servicios')
      .set('x-api-key', key)
      .expect(200);
  });
  test('read-only credentials cannot create resources or use unimplemented endpoints', async () => {
    await request(app.getHttpServer())
      .put(base + '/productores/p1')
      .set('x-api-key', key)
      .send({ nombre: 'No crear' })
      .expect(403);
    expect(service.create).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .delete(base + '/productores/p1')
      .set('x-api-key', key)
      .expect(401);
    await request(app.getHttpServer())
      .get(base + '/secret')
      .set('x-api-key', key)
      .expect(401);
  });
  test('checks the current operator and license, not a permission sent by the client', async () => {
    await request(app.getHttpServer())
      .get(base + '/lotes/l1')
      .set('x-api-key', key)
      .set('X-Permiso', '99')
      .expect(200);
    expect(service.get.mock.calls[0][2].permission.nivel).toBe('Asesor');
    users.getById.mockResolvedValueOnce({
      activo: false,
      permisos: [{ nivel: 'Asesor', rol: 'Admin' }],
    });
    await request(app.getHttpServer())
      .get(base + '/servicios')
      .set('x-api-key', key)
      .expect(403);
    license.getLicenciaEfectivaPorPermiso.mockResolvedValueOnce({
      nombre: 'fallback without persisted license',
    });
    await request(app.getHttpServer())
      .get(base + '/servicios')
      .set('x-api-key', key)
      .expect(403);
  });
  test('handles fresh, pending and unchanged phenology without leaking snapshots', async () => {
    const fresh = await request(app.getHttpServer())
      .get(base + '/siembras/s1/fenologia')
      .set('x-api-key', key)
      .expect(200);
    expect(fresh.headers.etag).toBe('"stable"');
    expect(fresh.headers['cache-control']).toBe('no-store');
    expect(fresh.headers['x-request-id']).toBeTruthy();
    const unchanged = await request(app.getHttpServer())
      .get(base + '/siembras/s1/fenologia')
      .set('x-api-key', key)
      .set('If-None-Match', '"stable"')
      .expect(304);
    expect(unchanged.text).toBe('');
    service.phenology.mockResolvedValueOnce({
      estado: 'pendiente',
      etapa: null,
      revision: 'pending',
    });
    await request(app.getHttpServer())
      .get(base + '/siembras/s1/fenologia')
      .set('x-api-key', key)
      .expect(202);
  });
  test('does not log partner business payload or credentials', () => {
    expect(
      requestBodyForLog(base + '/productores/p1', {
        nombre: 'Private customer',
        secret: key,
      }),
    ).toEqual({ integrationPayload: '[omitted]' });
  });
});
