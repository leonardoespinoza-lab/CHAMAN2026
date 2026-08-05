import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const paths = {
  system: new URL('../../sdc-app-chaman/src/chaman-design-system.scss', import.meta.url),
  organic: new URL('../../sdc-app-chaman/src/organic-intelligence.scss', import.meta.url),
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

const frontendRoot = fileURLToPath(new URL('../../sdc-app-chaman/src', import.meta.url));
const firstPartyExtensions = new Set(['.scss', '.css', '.html', '.ts']);
const excludedFirstPartyFiles = new Set([
  // Hoja compilada del tema PrimeNG. No es codigo visual mantenido por Chaman.
  'primeng.scss',
]);

/*
 * Excepciones estructurales, deliberadamente pequenas y exactas. Una nueva
 * excepcion debe explicar por que no representa una tarjeta de estado.
 */
const decorativeRailAllowlist = [
  {
    file: 'app/main/nav/nav.component.scss',
    selector: /^a$/,
    rules: new Set(['thick-side-border']),
    reason: 'Reserva transparente para evitar que la navegacion salte al activar un enlace.',
  },
  {
    file: 'app/main/nav/nav.component.scss',
    selector: /^\.active$/,
    rules: new Set(['thick-side-border']),
    reason: 'Indicador de seleccion del menu, no una superficie semantica de datos.',
  },
  {
    file: 'app/main/modulo-productor/lotes/detalles-lote/card-ndvi/card-ndvi.component.scss',
    selector: /^\.history-selected-scene \.history-stage$/,
    rules: new Set(['thick-side-border']),
    reason: 'Separador neutral entre columnas de la escena satelital seleccionada.',
  },
  {
    file: 'app/main/modulo-productor/lotes/detalles-lote/card-etapas-fenologicas/card-etapas-fenologicas.component.scss',
    selector: /^\.growth-soil$/,
    rules: new Set(['thick-horizontal-border']),
    reason: 'Linea fisica del perfil de suelo en la ilustracion fenologica.',
  },
  {
    file: 'app/main/modulo-productor/lotes/detalles-lote/card-etapas-fenologicas/card-etapas-fenologicas.component.scss',
    selector: /^\.growth-stage\.current::before$/,
    rules: new Set(['thick-horizontal-border']),
    reason: 'Hito superior del estadio actual dentro de la ilustracion fenologica.',
  },
  {
    file: 'app/main/modulo-productor/lotes/detalles-lote/card-etapas-fenologicas/card-etapas-fenologicas.component.scss',
    selector: /^\.stage-step$/,
    rules: new Set(['thick-horizontal-border']),
    reason: 'Linea de progreso de la cronologia fenologica, no una tarjeta de estado general.',
  },
  {
    file: 'app/main/modulo-productor/alertas/listado-alertas/listado-alertas.component.ts',
    selector: /^header$/,
    rules: new Set(['thick-horizontal-border']),
    reason: 'Separador de cabecera del informe imprimible de alarmas.',
  },
  {
    file: 'app/main/modulo-distribuidor/dashboard/dashboard.component.ts',
    selector: /^\.cover$/,
    rules: new Set(['thick-horizontal-border']),
    reason: 'Linea institucional de portada del informe PDF del distribuidor.',
  },
  {
    file: 'app/main/modulo-quimica/dashboard/dashboard.component.ts',
    selector: /^\.cover$/,
    rules: new Set(['thick-horizontal-border']),
    reason: 'Linea institucional de portada del informe PDF de compania.',
  },
];

const normalizePath = (path) => path.replaceAll('\\', '/');

async function listFirstPartyStyleSources(directory = frontendRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) return listFirstPartyStyleSources(absolute);
      if (!firstPartyExtensions.has(extname(entry.name))) return [];
      if (excludedFirstPartyFiles.has(entry.name)) return [];
      if (entry.name.endsWith('.spec.ts')) return [];
      return [absolute];
    }),
  );
  return nested.flat();
}

function maskComments(source) {
  const preserveLines = (text) => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, preserveLines)
    .replace(/<!--[\s\S]*?-->/g, preserveLines)
    .replace(/^\s*\/\/.*$/gm, preserveLines);
}

function lineNumberAt(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function containingSelector(source, declarationIndex) {
  let depth = 0;
  let openingBrace = -1;
  for (let cursor = declarationIndex - 1; cursor >= 0; cursor -= 1) {
    const character = source[cursor];
    if (character === '}') {
      depth += 1;
    } else if (character === '{') {
      if (depth === 0) {
        openingBrace = cursor;
        break;
      }
      depth -= 1;
    }
  }
  if (openingBrace < 0) return '<inline-or-root>';

  let start = openingBrace - 1;
  while (start >= 0 && !'{};'.includes(source[start])) start -= 1;
  return source
    .slice(start + 1, openingBrace)
    .replace(/\s+/g, ' ')
    .trim() || '<anonymous-rule>';
}

function isAllowlisted(violation) {
  return decorativeRailAllowlist.some(
    (entry) =>
      entry.file === violation.file &&
      entry.rules.has(violation.rule) &&
      entry.selector.test(violation.selector),
  );
}

function collectDecorativeRailViolations(file, source) {
  const masked = maskComments(source);
  const violations = [];

  const add = (rule, index, declaration, selector = containingSelector(masked, index)) => {
    const violation = {
      file,
      line: lineNumberAt(masked, index),
      rule,
      selector,
      declaration: declaration.replace(/\s+/g, ' ').trim(),
    };
    if (!isAllowlisted(violation)) violations.push(violation);
  };

  const thickBorder = /\bborder-(left|right|inline-start|inline-end)\s*:\s*([^;}\n]+)/gi;
  for (const match of masked.matchAll(thickBorder)) {
    const width = match[2].match(/(-?\d+(?:\.\d+)?)px\b/i);
    if (width && Math.abs(Number(width[1])) > 1) {
      add('thick-side-border', match.index, match[0]);
    }
  }

  const thickSideWidth = /\bborder-(left|right|inline-start|inline-end)-width\s*:\s*(-?\d+(?:\.\d+)?)px\b/gi;
  for (const match of masked.matchAll(thickSideWidth)) {
    if (Math.abs(Number(match[2])) > 1) {
      add('thick-side-border', match.index, match[0]);
    }
  }

  const coloredSideOverride = /\bborder-(left|right|inline-start|inline-end)-color\s*:\s*([^;}\n]+)/gi;
  for (const match of masked.matchAll(coloredSideOverride)) {
    add('colored-side-override', match.index, match[0]);
  }

  const thickHorizontalBorder = /\bborder-(top|bottom)\s*:\s*([^;}\n]+)/gi;
  for (const match of masked.matchAll(thickHorizontalBorder)) {
    const width = match[2].match(/(-?\d+(?:\.\d+)?)px\b/i);
    if (width && Math.abs(Number(width[1])) > 1) {
      add('thick-horizontal-border', match.index, match[0]);
    }
  }

  const thickHorizontalWidth = /\bborder-(top|bottom)-width\s*:\s*(-?\d+(?:\.\d+)?)px\b/gi;
  for (const match of masked.matchAll(thickHorizontalWidth)) {
    if (Math.abs(Number(match[2])) > 1) {
      add('thick-horizontal-border', match.index, match[0]);
    }
  }

  const boxShadow = /\bbox-shadow\s*:\s*([^;}\n]+)/gi;
  for (const match of masked.matchAll(boxShadow)) {
    const shadow = match[1];
    const inset = /\binset\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?/i.exec(
      shadow,
    );
    if (!inset) continue;
    const offsetX = Math.abs(Number(inset[1]));
    const offsetY = Math.abs(Number(inset[2]));
    if (offsetX > 1 && offsetY === 0) {
      add('inset-side-rail', match.index, match[0]);
    } else if (offsetY > 1 && offsetX === 0) {
      add('inset-horizontal-rail', match.index, match[0]);
    }
  }

  const pseudoRule = /([^{}]+::(?:before|after)[^{}]*)\{([^{}]*)\}/gi;
  for (const match of masked.matchAll(pseudoRule)) {
    const selector = match[1].replace(/\s+/g, ' ').trim().split(';').at(-1).trim();
    const body = match[2];
    const width = /\bwidth\s*:\s*(\d+(?:\.\d+)?)px\b/i.exec(body);
    const height = /\bheight\s*:\s*(\d+(?:\.\d+)?)px\b/i.exec(body);
    const fullHeight =
      /\binset\s*:\s*0(?:px)?\s+auto\s+0(?:px)?\s+(?:0(?:px)?|auto)/i.test(body) ||
      (/\btop\s*:\s*0(?:px)?/i.test(body) && /\bbottom\s*:\s*0(?:px)?/i.test(body));
    const fullWidth =
      /\binset\s*:\s*(?:auto|0(?:px)?)\s+0(?:px)?\s+(?:0(?:px)?|auto)\s+0(?:px)?/i.test(body) ||
      (/\bleft\s*:\s*0(?:px)?/i.test(body) && /\bright\s*:\s*0(?:px)?/i.test(body));

    if (width && Number(width[1]) > 1 && Number(width[1]) <= 5 && fullHeight) {
      add('pseudo-side-rail', match.index, `${selector} { width: ${width[1]}px; ... }`, selector);
    }
    if (height && Number(height[1]) > 1 && Number(height[1]) <= 5 && fullWidth) {
      add('pseudo-horizontal-rail', match.index, `${selector} { height: ${height[1]}px; ... }`, selector);
    }
  }

  const unique = new Map();
  violations.forEach((violation) => {
    const key = `${violation.file}:${violation.line}:${violation.rule}:${violation.declaration}`;
    unique.set(key, violation);
  });
  return [...unique.values()];
}

function formatViolations(violations) {
  return violations
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .map(
      ({ file, line, rule, selector, declaration }) =>
        `- ${file}:${line} [${rule}] ${selector}\n  ${declaration}`,
    )
    .join('\n');
}

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

test('los accesos secundarios usan una superficie blanca, opaca y tenant-aware', async () => {
  const css = await read(paths.organic);

  assert.match(css, /--chaman-secondary-action-bg:\s*#ffffff\s*!important/);
  assert.match(
    css,
    /--chaman-secondary-action-border:\s*color-mix\(in srgb, var\(--chaman-muted\)/,
  );
  assert.match(
    css,
    /--chaman-secondary-action-text:\s*color-mix\(in srgb, var\(--p-primary-color\)/,
  );
});

test('el contrato de acciones no borra la jerarquia primaria ni los estados operativos', async () => {
  const css = await read(paths.system);

  assert.match(css, /\[data-chaman-action="info"\][\s\S]{0,700}min-block-size:\s*44px\s*!important/);
  assert.ok(css.includes('.p-button.p-button-secondary'));
  assert.ok(css.includes('[data-chaman-action="secondary"]'));
  assert.ok(css.includes('[data-chaman-action="info"]'));
  assert.doesNotMatch(css, /\.p-button\.p-button-text:not\(/);
  ['primary', 'danger', 'warn', 'success', 'help', 'contrast'].forEach((severity) => {
    assert.match(css, new RegExp(`:not\\(\\s*\\.p-button-${severity}\\s*\\)`), `Falta excluir ${severity}`);
  });
  assert.ok(!css.includes(':not(.p-button-info)'), 'Los accesos info outlined deben quedar incluidos');
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

test('el detector global reconoce bordes, sombras, pseudo-elementos y estilos inline', () => {
  const fixture = `
    .side-card { border-left: 4px solid red; }
    .side-shadow { box-shadow: inset 3px 0 0 blue; }
    .bottom-shadow { box-shadow: inset 0 -3px 0 orange; }
    .bottom-border { border-bottom-width: 3px; }
    .pseudo-card::before {
      content: '';
      inset: 0 auto 0 0;
      width: 3px;
    }
    <article style="border-right: 5px solid green"></article>
  `;
  const rules = new Set(
    collectDecorativeRailViolations('app/fixture.component.html', fixture).map(({ rule }) => rule),
  );

  assert.deepEqual(
    rules,
    new Set([
      'thick-side-border',
      'inset-side-rail',
      'inset-horizontal-rail',
      'thick-horizontal-border',
      'pseudo-side-rail',
    ]),
  );
});

test('ninguna superficie first-party reintroduce franjas decorativas', async () => {
  const files = await listFirstPartyStyleSources();
  const violations = (
    await Promise.all(
      files.map(async (absolute) => {
        const file = normalizePath(relative(frontendRoot, absolute));
        return collectDecorativeRailViolations(file, await readFile(absolute, 'utf8'));
      }),
    )
  ).flat();

  assert.equal(
    violations.length,
    0,
    `Se detectaron ${violations.length} franjas decorativas fuera de la allowlist:\n${formatViolations(violations)}`,
  );
});
