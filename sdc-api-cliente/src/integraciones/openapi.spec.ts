import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RequestMethod } from '@nestjs/common';
import { INTEGRATION_PREFIX, INTEGRATION_ROUTES } from './contract';

test('published contract exactly matches the integration authentication exclusions', () => {
  const spec = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../docs/integraciones/v1/openapi.json'),
      'utf8',
    ),
  );
  const actual = INTEGRATION_ROUTES.map(
    (route) =>
      `${RequestMethod[route.method].toLowerCase()} ${route.path.replace(INTEGRATION_PREFIX, '').replace(':externalId', '{idExterno}')}`,
  ).sort();
  const documented = Object.entries(spec.paths)
    .flatMap(([path, methods]) =>
      Object.keys(methods)
        .filter((method) =>
          ['get', 'put', 'post', 'delete', 'patch'].includes(method),
        )
        .map((method) => `${method} ${path}`),
    )
    .sort();
  expect(documented).toEqual(actual);
});
