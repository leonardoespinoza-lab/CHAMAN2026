const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const producerHtml = read(
  "sdc-app-chaman/src/app/main/modulo-distribuidor/productores/crear-editar-productores/crear-editar-productores.component.html",
);
const producerTs = read(
  "sdc-app-chaman/src/app/main/modulo-distribuidor/productores/crear-editar-productores/crear-editar-productores.component.ts",
);
const dashboardHtml = read(
  "sdc-app-chaman/src/app/main/modulo-distribuidor/dashboard/dashboard.component.html",
);
const dashboardCss = read(
  "sdc-app-chaman/src/app/main/modulo-distribuidor/dashboard/dashboard.component.scss",
);
const licenseController = read(
  "sdc-api-cliente/src/entidades/licenciaPorEntidad/controller.ts",
);

test("el formulario no expone el indicador legacy de acceso gratuito", () => {
  assert.doesNotMatch(producerHtml, /Acceso sin cargo/);
  assert.doesNotMatch(producerHtml, /formControlName="gratis"/);
});

test("la asignacion distingue herencia, prueba, cortesia y suscripcion", () => {
  assert.match(producerHtml, /Licencia y vigencia/);
  assert.match(producerHtml, /producerLicenseMode/);
  assert.match(producerTs, /Heredar de la red/);
  assert.match(producerTs, /Prueba temporal/);
  assert.match(producerTs, /Cortesía comercial/);
  assert.match(producerTs, /Suscripción/);
  assert.match(producerHtml, /Vigencia hasta/);
});

test("el asesor ve el plan sin recibir controles de administracion", () => {
  assert.match(dashboardHtml, /Plan de la red/);
  assert.match(dashboardHtml, /estadoLicencia\?\.licencia\?\.nombre/);
  assert.doesNotMatch(dashboardHtml, /Administrar licencia/);
});

test("las acciones principales comparten una unica regla visual", () => {
  const actions = dashboardHtml.match(/class="dashboard-action-button"/g) || [];
  assert.equal(actions.length, 3);
  assert.match(dashboardCss, /button\.p-button\.dashboard-action-button/);
});

test("asignar y volver a herencia siguen limitados al Admin global", () => {
  assert.match(
    licenseController,
    /@Put\('\/entidad\/:tipo\/:id'\)[\s\S]*?@Permisos\(\{ nivel: 'Admin', roles: \['Admin'\] \}\)/,
  );
  assert.match(
    licenseController,
    /@Put\('\/entidad\/:tipo\/:id\/heredar'\)[\s\S]*?@Permisos\(\{ nivel: 'Admin', roles: \['Admin'\] \}\)/,
  );
});
