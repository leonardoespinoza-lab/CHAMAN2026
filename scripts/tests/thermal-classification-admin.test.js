const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const componentPath = path.join(
  root,
  "sdc-app-chaman/src/app/main/modulo-admin/semillas/crear-editar-semillas/crear-editar-semillas.component.ts",
);
const templatePath = path.join(
  root,
  "sdc-app-chaman/src/app/main/modulo-admin/semillas/crear-editar-semillas/crear-editar-semillas.component.html",
);
const component = fs.readFileSync(componentPath, "utf8");
const template = fs.readFileSync(templatePath, "utf8");

test("la dormancia se presenta únicamente bajo la condición de cultivo perenne", () => {
  assert.match(component, /get\s+esCultivoPerenneSeleccionado\s*\(\)/);
  assert.match(
    template,
    /@if\s*\(esCultivoPerenneSeleccionado\)\s*\{[\s\S]*?formGroupName="requerimientoFrio"/,
  );
  assert.equal(
    (template.match(/formGroupName="requerimientoFrio"/g) || []).length,
    1,
  );
});

test("la vernalización es obligatoria para Trigo/Cebada y opcional por variedad en Arveja", () => {
  assert.match(component, /get\s+permiteVernalizacionSeleccionada\s*\(\)/);
  assert.match(component, /get\s+usaVernalizacionSeleccionada\s*\(\)/);
  assert.match(
    template,
    /@if\s*\(permiteVernalizacionSeleccionada\)\s*\{[\s\S]*?formGroupName="requerimientoVernalizacion"/,
  );
  assert.match(template, /cultivoSeleccionado\s*===\s*'Arveja'/);
  assert.match(template, /formControlName="activada"/);
  assert.equal(
    (template.match(/formGroupName="requerimientoVernalizacion"/g) || [])
      .length,
    1,
  );
});

test("el formulario no ofrece APSIM como calibración varietal declarada", () => {
  assert.doesNotMatch(component, /apsim_trigo|apsim_cebada/i);
  assert.match(component, /ventana_calibrada/);
});
