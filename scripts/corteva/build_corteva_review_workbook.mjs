import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputJson = process.argv[2];
const outputXlsx = process.argv[3];

if (!inputJson || !outputXlsx) {
  console.error("Usage: node build_corteva_review_workbook.mjs <geocoded.json> <output.xlsx>");
  process.exit(1);
}

const rows = JSON.parse(await fs.readFile(inputJson, "utf8"));
const outputDir = path.dirname(outputXlsx);
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const resumen = workbook.worksheets.add("Resumen");
const detalle = workbook.worksheets.add("Distribuidores");
const payloadSheet = workbook.worksheets.add("Payload Chaman");

const countBy = (field) =>
  rows.reduce((acc, row) => {
    const key = row[field] || "(vacio)";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

const estados = countBy("estado_coordenada_chaman");
const confianza = countBy("confianza");
const uniqueNames = new Set(rows.map((row) => String(row.nombre_chaman || "").toUpperCase().trim())).size;
const withGeojson = rows.filter((row) => row.lat && row.lon).length;
const exactOrHighConfidence =
  (estados.EXACTA_MYMAPS || 0) +
  (estados.EXACTA_PLANILLA || 0) +
  (estados.EXACTA_GOOGLE_LINK || 0) +
  (estados.GEOCODIFICADA_GOOGLE || 0) +
  (estados.GEOCODIFICADA_GOOGLE_PLACES || 0);
const approximate = estados.CENTROIDE_LOCALIDAD || 0;

resumen.showGridLines = false;
resumen.getRange("A1:F1").merge();
resumen.getRange("A1").values = [["Carga Corteva - Distribuidores operativos"]];
resumen.getRange("A1").format = {
  fill: "#12355B",
  font: { bold: true, color: "#FFFFFF", size: 16 },
};
resumen.getRange("A2:F2").merge();
resumen.getRange("A2").values = [[
  "Preparacion para demo: cada sucursal se carga como distribuidor de Corteva con nombre unico, direccion y punto de mapa.",
]];
resumen.getRange("A2").format = { font: { color: "#334155" }, wrapText: true };

const summaryRows = [
  ["Total sucursales", rows.length],
  ["Nombres unicos para Chaman", uniqueNames],
  ["Con geojson utilizable", withGeojson],
  ["Punto exacto / confianza alta", exactOrHighConfidence],
  ["Exactas desde My Maps", estados.EXACTA_MYMAPS || 0],
  ["Exactas desde planilla", estados.EXACTA_PLANILLA || 0],
  ["Exactas desde link Google", estados.EXACTA_GOOGLE_LINK || 0],
  ["Google oficial API", (estados.GEOCODIFICADA_GOOGLE || 0) + (estados.GEOCODIFICADA_GOOGLE_PLACES || 0)],
  ["Geocodificadas por direccion", estados.GEOCODIFICADA_DIRECCION || 0],
  ["Centroide de localidad", estados.CENTROIDE_LOCALIDAD || 0],
  ["Pendientes de punto exacto", approximate + (estados.REVISAR_SIN_COORDENADA || 0)],
  ["Confianza alta", confianza.alta || 0],
  ["Confianza media", confianza.media || 0],
  ["Confianza revisar", confianza.revisar || 0],
];
resumen.getRange("A4:B17").values = summaryRows;
resumen.getRange("A4:B4").format = { fill: "#E0F7F4", font: { bold: true } };
resumen.getRange("A4:A17").format = { font: { bold: true, color: "#12355B" } };
resumen.getRange("B4:B17").format = { numberFormat: "#,##0" };
resumen.getRange("A19:F25").values = [
  ["Criterio de ubicacion", "", "", "", "", ""],
  ["EXACTA_MYMAPS", "Coordenada extraida del visor publico de Google My Maps. Es la fuente prioritaria para esta carga.", "", "", "", ""],
  ["EXACTA_PLANILLA", "Lat/lon provista por el Excel original.", "", "", "", ""],
  ["EXACTA_GOOGLE_LINK", "Lat/lon explicita dentro de un link Google Maps del Excel.", "", "", "", ""],
  ["GOOGLE_OFICIAL_API", "Coordenada resuelta con Google Geocoding o Places si se ejecuta con MAPS_KEY.", "", "", "", ""],
  ["GEOCODIFICADA_DIRECCION", "Direccion encontrada por Nominatim/OpenStreetMap. Revisar visualmente para demo final.", "", "", "", ""],
  ["CENTROIDE_LOCALIDAD", "No se encontro punto exacto; no cargar como definitivo salvo aprobacion manual.", "", "", "", ""],
];
resumen.getRange("A19:F19").merge();
resumen.getRange("A19").format = { fill: "#12355B", font: { bold: true, color: "#FFFFFF" } };
resumen.getRange("A20:A25").format = { font: { bold: true } };
resumen.getRange("B20:F25").merge(true);
resumen.getRange("B20:F25").format = { wrapText: true };
resumen.getRange("A1:F25").format.borders = { preset: "inside", style: "thin", color: "#D7E3EF" };
resumen.getRange("A1:F25").format.autofitColumns();
resumen.getRange("A1:F25").format.autofitRows();
resumen.freezePanes.freezeRows(3);

const detailHeaders = [
  "fila_excel",
  "nombre_chaman",
  "distribuidor_original",
  "localidad",
  "provincia",
  "direccion_chaman",
  "telefono",
  "codigo_postal",
  "lat",
  "lon",
  "estado_coordenada_chaman",
  "confianza",
  "fuente_geocodificacion",
  "consulta_geocodificacion",
  "resultado_geocodificacion",
  "link_busqueda_google_maps",
  "link_como_llegar",
];
const detailMatrix = [detailHeaders, ...rows.map((row) => detailHeaders.map((header) => row[header] ?? ""))];
detalle.showGridLines = false;
detalle.getRangeByIndexes(0, 0, detailMatrix.length, detailHeaders.length).values = detailMatrix;
detalle.getRangeByIndexes(0, 0, 1, detailHeaders.length).format = {
  fill: "#12355B",
  font: { bold: true, color: "#FFFFFF" },
};
detalle.getRangeByIndexes(0, 0, detailMatrix.length, detailHeaders.length).format.borders = {
  preset: "inside",
  style: "thin",
  color: "#D7E3EF",
};
detalle.getRangeByIndexes(1, 8, rows.length, 2).format.numberFormat = "0.000000";
detalle.getRangeByIndexes(0, 0, detailMatrix.length, detailHeaders.length).format.autofitColumns();
detalle.getRange("B:B").format.columnWidth = 32;
detalle.getRange("F:F").format.columnWidth = 44;
detalle.getRange("O:O").format.columnWidth = 60;
detalle.getRange("P:Q").format.columnWidth = 44;
detalle.getRange("A1:Q185").format.wrapText = true;
detalle.freezePanes.freezeRows(1);

const payloadHeaders = ["nombre", "direccion", "geojson.type", "geojson.lon", "geojson.lat", "idQuimica"];
const payloadRows = rows.map((row) => {
  const payload = JSON.parse(row.payload_json);
  const coordinates = payload.geojson?.coordinates || ["", ""];
  return [
    payload.nombre,
    payload.direccion,
    payload.geojson?.type || "",
    coordinates[0],
    coordinates[1],
    payload.idQuimica,
  ];
});
payloadSheet.showGridLines = false;
payloadSheet.getRangeByIndexes(0, 0, payloadRows.length + 1, payloadHeaders.length).values = [
  payloadHeaders,
  ...payloadRows,
];
payloadSheet.getRangeByIndexes(0, 0, 1, payloadHeaders.length).format = {
  fill: "#0F766E",
  font: { bold: true, color: "#FFFFFF" },
};
payloadSheet.getRangeByIndexes(0, 0, payloadRows.length + 1, payloadHeaders.length).format.borders = {
  preset: "inside",
  style: "thin",
  color: "#D7E3EF",
};
payloadSheet.getRangeByIndexes(1, 3, payloadRows.length, 2).format.numberFormat = "0.000000";
payloadSheet.getRangeByIndexes(0, 0, payloadRows.length + 1, payloadHeaders.length).format.autofitColumns();
payloadSheet.getRange("A:A").format.columnWidth = 34;
payloadSheet.getRange("B:B").format.columnWidth = 52;
payloadSheet.freezePanes.freezeRows(1);

const preview = await workbook.render({
  sheetName: "Resumen",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "corteva_distribuidores_resumen_preview.png"),
  new Uint8Array(await preview.arrayBuffer()),
);

const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputXlsx);
console.log(outputXlsx);
