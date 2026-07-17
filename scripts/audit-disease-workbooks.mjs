import { FileBlob, SpreadsheetFile } from 'file:///C:/Users/lespinoza/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  throw new Error('Indique al menos un archivo XLSX.');
}

for (const file of files) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(file));
  const sheets = await workbook.inspect({
    kind: 'sheet',
    include: 'id,name',
    maxChars: 12000,
  });
  const regions = await workbook.inspect({
    kind: 'region',
    range: 'A1:Z80',
    maxChars: 30000,
    tableMaxRows: 80,
    tableMaxCols: 26,
    tableMaxCellChars: 180,
  });
  const formulas = await workbook.inspect({
    kind: 'formula',
    range: 'A1:Z200',
    maxChars: 12000,
    options: { maxResults: 250 },
  });

  process.stdout.write(`\n=== ${file} ===\n`);
  process.stdout.write(`${sheets.ndjson || sheets}\n`);
  process.stdout.write(`${regions.ndjson || regions}\n`);
  process.stdout.write(`${formulas.ndjson || formulas}\n`);
}
