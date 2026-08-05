import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const paths = {
  system: new URL('../../sdc-app-chaman/src/chaman-design-system.scss', import.meta.url),
  alarms: new URL(
    '../../sdc-app-chaman/src/app/main/modulo-productor/alertas/listado-alertas/listado-alertas.component.scss',
    import.meta.url,
  ),
  establishments: new URL(
    '../../sdc-app-chaman/src/app/main/modulo-productor/establecimientos/listado-establecimientos/listado-establecimientos.component.scss',
    import.meta.url,
  ),
};

const read = (path) => readFile(path, 'utf8');

test('el sistema visual cubre las superficies operativas compartidas', async () => {
  const css = await read(paths.system);
  const requiredSelectors = [
    '.alarm-card',
    '.hero-status',
    '.command-card',
    '.category-chip',
    '.metrics-strip article',
    '.central-grid article',
    '.detail-hero',
  ];

  requiredSelectors.forEach((selector) => {
    assert.ok(css.includes(selector), `Falta normalizar ${selector}`);
  });

  assert.match(css, /border-inline-start-width:\s*1px\s*!important/);
  assert.match(css, /border:\s*1px solid var\(--ch-surface-border\)\s*!important/);
});

test('Alarmas no reintroduce franjas cromaticas locales', async () => {
  const css = await read(paths.alarms);

  assert.doesNotMatch(css, /\.alarm-card[\s\S]{0,300}border-left\s*:/);
  assert.doesNotMatch(css, /\.command-card[\s\S]{0,260}border-bottom\s*:/);
  assert.doesNotMatch(css, /\.hero-status[\s\S]{0,260}border-left\s*:/);
  assert.doesNotMatch(css, /\.category-chip\.(?:baja|media|alta|critica)[\s\S]{0,120}border-color\s*:/);
});

test('Establecimientos no reintroduce franjas cromaticas en sus metricas', async () => {
  const css = await read(paths.establishments);

  assert.doesNotMatch(css, /\.metrics-strip article[\s\S]{0,420}border-left\s*:/);
  assert.doesNotMatch(css, /\.metrics-strip article\.(?:ok|warn|danger|info|muted)[\s\S]{0,120}border-left-color\s*:/);
});
