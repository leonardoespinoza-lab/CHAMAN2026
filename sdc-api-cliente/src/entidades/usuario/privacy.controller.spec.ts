import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AxiosService } from '../../auxiliares/axios/axios.service';
import { PrivacyController } from './privacy.controller';
jest.mock('../../env', () => ({ API_DATOS: 'http://datos.invalid' }));

describe('Privacy API: session scope and permissions', () => {
  let app: INestApplication;
  const id = '1234567890abcdef12345678';
  const transport = { GET: jest.fn(), POST: jest.fn() };
  const original = process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [{ provide: AxiosService, useValue: transport }],
    }).compile();
    app = module.createNestApplication();
    // Only this test harness injects a fake session. Production uses its existing
    // AuthenticationMiddleware before PermisoGuard; these headers are not auth.
    app.use((req, res, next) => {
      if (req.headers['test-role']) {
        res.locals.token = { user: { _id: id } };
        res.locals.permiso =
          req.headers['test-role'] === 'admin'
            ? { nivel: 'Admin', rol: 'Admin' }
            : { nivel: 'Productor', rol: 'Lectura' };
      }
      next();
    });
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN =
      'test-only-not-a-real-secret-1234567890';
    transport.POST.mockResolvedValue({ _id: id, status: 'pending' });
    transport.GET.mockResolvedValue(null);
  });
  afterAll(async () => {
    await app.close();
    if (original === undefined)
      delete process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN;
    else process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN = original;
  });
  it('rejects a request without an authenticated permission', async () => {
    await request(app.getHttpServer())
      .post('/cuenta/privacidad/eliminacion')
      .send({ confirmacion: 'ELIMINAR MI CUENTA' })
      .expect(403);
    expect(transport.POST).not.toHaveBeenCalled();
  });
  it('allows a read-only user to request their own account deletion', async () => {
    await request(app.getHttpServer())
      .post('/cuenta/privacidad/eliminacion')
      .set('test-role', 'reader')
      .send({ confirmacion: 'ELIMINAR MI CUENTA' })
      .expect(201);
    expect(transport.POST).toHaveBeenCalledWith(
      'http://datos.invalid/privacy-requests/' + id,
      {},
      expect.any(Object),
    );
  });
  it.each([
    {},
    { confirmacion: 'no' },
    { confirmacion: 'ELIMINAR MI CUENTA', userId: 'ffffffffffffffffffffffff' },
    { confirmacion: 'ELIMINAR MI CUENTA', status: 'completed' },
  ])('rejects absent confirmation and injected fields: %j', async (body) => {
    await request(app.getHttpServer())
      .post('/cuenta/privacidad/eliminacion')
      .set('test-role', 'reader')
      .send(body)
      .expect(400);
    expect(transport.POST).not.toHaveBeenCalled();
  });
  it('scopes status to the session and never accepts a target ID', async () => {
    await request(app.getHttpServer())
      .get('/cuenta/privacidad/eliminacion?userId=other')
      .set('test-role', 'reader')
      .expect(200);
    expect(transport.GET).toHaveBeenCalledWith(
      'http://datos.invalid/privacy-requests/' + id,
      expect.any(Object),
    );
  });
  it('does not allow a client to read the global queue', async () => {
    await request(app.getHttpServer())
      .get('/cuenta/privacidad/solicitudes')
      .set('test-role', 'reader')
      .expect(403);
  });
  it('allows only central administration to read the queue', async () => {
    await request(app.getHttpServer())
      .get('/cuenta/privacidad/solicitudes?page=2')
      .set('test-role', 'admin')
      .expect(200);
    expect(transport.GET).toHaveBeenCalledWith(
      'http://datos.invalid/privacy-requests?page=2',
      expect.any(Object),
    );
  });
  it('rejects malformed pagination', async () => {
    await request(app.getHttpServer())
      .get('/cuenta/privacidad/solicitudes?page=-1')
      .set('test-role', 'admin')
      .expect(400);
  });
  it('fails closed before service configuration', async () => {
    delete process.env.PRIVACY_REQUESTS_INTERNAL_TOKEN;
    await request(app.getHttpServer())
      .post('/cuenta/privacidad/eliminacion')
      .set('test-role', 'reader')
      .send({ confirmacion: 'ELIMINAR MI CUENTA' })
      .expect(503);
    expect(transport.POST).not.toHaveBeenCalled();
  });
});
