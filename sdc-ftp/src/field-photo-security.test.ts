import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import {
  assertValidFieldPhoto,
  buildFieldPhotoStoragePlan,
  extractOperationalToken,
  hasOperationalAccess,
  isPrivateFieldPhotoPath,
  privateFieldPhotoAccess,
} from './field-photo-security';

test('extrae y valida el token operativo sin aceptar valores parciales', () => {
  assert.equal(
    extractOperationalToken({ authorization: 'Bearer secreto-operativo' }),
    'secreto-operativo',
  );
  assert.equal(
    hasOperationalAccess(
      { explicitToken: 'secreto-operativo' },
      'secreto-operativo',
    ),
    true,
  );
  assert.equal(
    hasOperationalAccess({ authorization: 'Bearer secreto' }, 'secreto-operativo'),
    false,
  );
  assert.equal(hasOperationalAccess({}, ''), false);
});

test('identifica CAMPO como privado aun codificado o con otra capitalizacion', () => {
  assert.equal(
    isPrivateFieldPhotoPath('/imagenes/CAMPO/lote-1/foto.jpg'),
    true,
  );
  assert.equal(isPrivateFieldPhotoPath('/campo/lote-1/foto.jpg'), true);
  assert.equal(
    isPrivateFieldPhotoPath('/imagenes/%43%41%4d%50%4f/lote-1/foto.jpg'),
    true,
  );
  assert.equal(
    isPrivateFieldPhotoPath('/imagenes/CAMARA/../CAMPO/lote-1/foto.jpg'),
    true,
  );
  assert.equal(
    isPrivateFieldPhotoPath('/imagenes/%2543%2541%254d%2550%254f/lote/foto.jpg'),
    true,
  );
  assert.equal(
    isPrivateFieldPhotoPath('/imagenes/CAMARA-1/2026-07-23/foto.jpg'),
    false,
  );
});

test('oculta CAMPO sin token y deja pasar capturas legacy', () => {
  const middleware = privateFieldPhotoAccess('secreto-operativo');
  let nextCalls = 0;
  let statusCode = 0;
  let responseBody: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      responseBody = value;
      return this;
    },
  };

  middleware(
    {
      originalUrl: '/imagenes/CAMPO/lote-1/foto.jpg',
      get: () => undefined,
    } as any,
    response as any,
    () => {
      nextCalls += 1;
    },
  );

  assert.equal(statusCode, 404);
  assert.deepEqual(responseBody, {
    ok: false,
    message: 'Imagen no encontrada.',
  });
  assert.equal(nextCalls, 0);

  middleware(
    {
      originalUrl: '/imagenes/CAMARA-1/2026-07-23/foto.jpg',
      get: () => undefined,
    } as any,
    response as any,
    () => {
      nextCalls += 1;
    },
  );
  assert.equal(nextCalls, 1);
});

test('permite CAMPO solo al proxy interno con token completo', () => {
  const middleware = privateFieldPhotoAccess('secreto-operativo');
  let nextCalls = 0;
  middleware(
    {
      originalUrl: '/imagenes/CAMPO/lote-1/foto.jpg',
      get: (name: string) =>
        name.toLowerCase() === 'authorization'
          ? 'Bearer secreto-operativo'
          : undefined,
    } as any,
    {} as any,
    () => {
      nextCalls += 1;
    },
  );
  assert.equal(nextCalls, 1);
});

test('construye una ruta de campo confinada y coherente con el MIME', () => {
  const baseDir = path.resolve('storage-test');
  const plan = buildFieldPhotoStoragePlan({
    baseDir,
    idLote: '../../lote sensible',
    originalName: '../../captura.png',
    contentType: 'image/jpeg',
    capturedAt: new Date('2026-07-23T12:00:00.000Z'),
    nonce: '123',
  });

  assert.equal(plan.storedName, '123-captura.jpg');
  assert.equal(
    plan.targetPath.startsWith(
      path.join(baseDir, 'CAMPO') + path.sep,
    ),
    true,
  );
  assert.equal(plan.relativePath.split(path.sep)[0], 'CAMPO');
});

test('valida firma, MIME y contenido antes de ingerir una foto', () => {
  assert.doesNotThrow(() =>
    assertValidFieldPhoto(
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      'image/jpeg',
    ),
  );
  assert.throws(
    () =>
      assertValidFieldPhoto(
        Buffer.from('no-es-jpeg'),
        'image/jpeg',
      ),
    /contenido no coincide/i,
  );
  assert.throws(
    () =>
      assertValidFieldPhoto(Buffer.from([1, 2, 3]), 'image/svg+xml'),
    /formato/i,
  );
});
