import ExcelJS from 'exceljs';
import {
  CATALOGO_CULTIVOS_FORMATO_VERSION,
  columnasSanitariasCatalogo,
  CULTIVOS_DISPONIBLES,
  Cultivo,
  enfermedadCoincide,
  IFilaCatalogoCultivos,
  IResistencia,
  ISemilla,
  normalizarPerfilCatalogo,
  perfilVisibleCatalogo,
  snapshotSemillaCatalogo,
  TConfianzaResistencia,
  TEstadoResistencia,
} from 'modelos/src';

export const HOJA_META_CATALOGO = '__META';
export const HOJA_DETALLE_CATALOGO = 'Resistencias_Detalle';
export const HOJA_LEEME_CATALOGO = 'LEEME';

export const ENCABEZADOS_CATALOGO = {
  id: '_CHAMAN_ID',
  snapshot: '_CHAMAN_SNAPSHOT',
  semillero: 'SEMILLERO',
  variedad: 'VARIEDAD',
  ciclo: 'CICLO',
  campania: 'CAMPAÑA',
  fuenteActualizacion: 'FUENTE DE ACTUALIZACIÓN',
  campaniaFuente: 'CAMPAÑA FUENTE',
  fechaFuente: 'FECHA FUENTE',
  estado: 'ESTADO',
  confianza: 'CONFIANZA',
  observacionesActualizacion: 'OBSERVACIONES DE ACTUALIZACIÓN',
} as const;

const ORDEN_HOJAS: Cultivo[] = [
  'Trigo',
  'Cebada',
  'Maiz',
  'Soja',
  'Arveja',
  'Papa',
  'Vid',
  'Manzano',
  'Peral',
  'Pecan',
];

const ESTADOS: TEstadoResistencia[] = ['observada', 'historica', 'inferida', 'desconocida'];
const CONFIANZAS: TConfianzaResistencia[] = ['alta', 'media', 'baja', 'sin_datos'];

const COLOR_ENCABEZADO = 'FFD9E2F3';
const COLOR_SEMILLERO = 'FF92D050';
const COLOR_EDITABLE = 'FFFFF2CC';
const COLOR_SOLO_LECTURA = 'FFE7E6E6';
const COLOR_TECNICO = 'FFD9D9D9';

interface IColumnaLibro {
  header: string;
  key: string;
  width: number;
  enfermedad?: ReturnType<typeof columnasSanitariasCatalogo>[number];
}

export function crearLibroCatalogoCultivos(semillas: ISemilla[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Chamán Agro';
  workbook.subject = 'Catálogo de cultivos editable sin JSON';
  workbook.title = 'Catálogo de cultivos Chamán';

  crearHojaLeeme(workbook, semillas.length);
  crearHojaMeta(workbook);
  for (const cultivo of ORDEN_HOJAS) {
    crearHojaCultivo(
      workbook,
      cultivo,
      (semillas || []).filter((item) => item.cultivo === cultivo)
    );
  }
  crearHojaDetalle(workbook, semillas || []);
  return workbook;
}

function crearHojaLeeme(workbook: ExcelJS.Workbook, cantidad: number): void {
  const worksheet = workbook.addWorksheet(HOJA_LEEME_CATALOGO);
  worksheet.mergeCells('A1:F1');
  worksheet.getCell('A1').value = 'CATÁLOGO DE CULTIVOS · CHAMÁN AGRO';
  worksheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  worksheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF14B8A6' },
  };
  worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;
  const instrucciones = [
    ['Objetivo', 'Editar y reimportar el catálogo sin JSON ni factores técnicos.'],
    ['Contenido', `${cantidad} variedades, separadas en 10 hojas por cultivo.`],
    ['Edición', 'Agregue filas nuevas o cambie categorías únicamente en celdas amarillas.'],
    ['Identidad', 'No cambie SEMILLERO, VARIEDAD, CICLO ni CAMPAÑA de filas existentes.'],
    ['Fuente', 'Toda categoría nueva o modificada requiere FUENTE DE ACTUALIZACIÓN.'],
    ['SIN_REGISTRO', 'No existe una entrada; no equivale a susceptible y no elimina datos.'],
    ['DESCONOCIDA', 'Existe la enfermedad, pero la fuente no aporta una categoría utilizable.'],
    ['DATO_ESPECIFICO', 'La evidencia es por patotipo o índice de campo; no se simplifica.'],
    ['Importación', 'Chamán previsualiza los cambios antes de escribir y nunca borra por omisión.'],
  ];
  instrucciones.forEach(([titulo, detalle], index) => {
    const row = index + 3;
    worksheet.getCell(row, 1).value = titulo;
    worksheet.getCell(row, 2).value = detalle;
    worksheet.getCell(row, 1).font = { bold: true, color: { argb: 'FF111827' } };
    worksheet.getCell(row, 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_ENCABEZADO },
    };
    for (let column = 1; column <= 2; column += 1) {
      worksheet.getCell(row, column).border = bordeFino();
      worksheet.getCell(row, column).alignment = { vertical: 'middle', wrapText: true };
    }
    worksheet.getRow(row).height = 28;
  });
  worksheet.mergeCells('A13:F13');
  worksheet.getCell('A13').value =
    'Los multiplicadores e índices de resistencia se derivan y validan en el backend según el cultivo.';
  worksheet.getCell('A13').font = { bold: true, color: { argb: 'FF7C2D12' } };
  worksheet.getCell('A13').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR_EDITABLE },
  };
  worksheet.getCell('A13').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  worksheet.getRow(13).height = 32;
  worksheet.getColumn(1).width = 22;
  worksheet.getColumn(2).width = 85;
  for (let column = 3; column <= 6; column += 1) worksheet.getColumn(column).width = 12;
  worksheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
}

function crearHojaMeta(workbook: ExcelJS.Workbook): void {
  const worksheet = workbook.addWorksheet(HOJA_META_CATALOGO, {
    state: 'veryHidden',
  });
  worksheet.getCell('A1').value = 'FORMATO_CHAMAN';
  worksheet.getCell('B1').value = CATALOGO_CULTIVOS_FORMATO_VERSION;
  worksheet.addRow([]);
  worksheet.addRow(['HOJA', 'ENCABEZADO', 'ID_ENFERMEDAD', 'EDITABLE', 'PERFILES_PERMITIDOS', 'MOTIVO_SOLO_LECTURA']);
  for (const cultivo of ORDEN_HOJAS) {
    for (const columna of columnasSanitariasCatalogo(cultivo)) {
      worksheet.addRow([
        cultivo,
        columna.encabezado,
        columna.idEnfermedad,
        columna.editable ? 'SI' : 'NO',
        columna.perfilesPermitidos.join(';'),
        columna.motivoSoloLectura || '',
      ]);
    }
  }
  worksheet.columns = [{ width: 16 }, { width: 42 }, { width: 34 }, { width: 12 }, { width: 28 }, { width: 80 }];
}

function columnasHojaCultivo(cultivo: Cultivo): IColumnaLibro[] {
  return [
    { header: ENCABEZADOS_CATALOGO.semillero, key: 'semillero', width: 24 },
    { header: ENCABEZADOS_CATALOGO.variedad, key: 'variedad', width: 28 },
    { header: ENCABEZADOS_CATALOGO.ciclo, key: 'ciclo', width: 20 },
    { header: ENCABEZADOS_CATALOGO.campania, key: 'campania', width: 16 },
    ...columnasSanitariasCatalogo(cultivo).map((enfermedad) => ({
      header: enfermedad.encabezado,
      key: enfermedad.idEnfermedad,
      width: Math.max(20, Math.min(34, enfermedad.encabezado.length + 4)),
      enfermedad,
    })),
    {
      header: ENCABEZADOS_CATALOGO.fuenteActualizacion,
      key: 'fuenteActualizacion',
      width: 38,
    },
    {
      header: ENCABEZADOS_CATALOGO.campaniaFuente,
      key: 'campaniaFuente',
      width: 18,
    },
    {
      header: ENCABEZADOS_CATALOGO.fechaFuente,
      key: 'fechaFuente',
      width: 18,
    },
    { header: ENCABEZADOS_CATALOGO.estado, key: 'estado', width: 16 },
    {
      header: ENCABEZADOS_CATALOGO.confianza,
      key: 'confianza',
      width: 16,
    },
    {
      header: ENCABEZADOS_CATALOGO.observacionesActualizacion,
      key: 'observacionesActualizacion',
      width: 44,
    },
    { header: ENCABEZADOS_CATALOGO.id, key: 'id', width: 26 },
    { header: ENCABEZADOS_CATALOGO.snapshot, key: 'snapshot', width: 22 },
  ];
}

function crearHojaCultivo(workbook: ExcelJS.Workbook, cultivo: Cultivo, semillas: ISemilla[]): void {
  const worksheet = workbook.addWorksheet(cultivo);
  const columnas = columnasHojaCultivo(cultivo);
  worksheet.columns = columnas.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));
  const idColumn = columnas.findIndex((item) => item.key === 'id') + 1;
  const snapshotColumn = columnas.findIndex((item) => item.key === 'snapshot') + 1;
  worksheet.getColumn(idColumn).hidden = true;
  worksheet.getColumn(snapshotColumn).hidden = true;
  worksheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1, activeCell: 'C2' }];

  const ordenadas = [...semillas].sort((left, right) =>
    [left.semillero, left.variedad, left.ciclo, left.campania]
      .map((value) => String(value || ''))
      .join('|')
      .localeCompare(
        [right.semillero, right.variedad, right.ciclo, right.campania].map((value) => String(value || '')).join('|'),
        'es',
        { sensitivity: 'base' }
      )
  );

  for (const semilla of ordenadas) {
    const perfiles = Object.fromEntries(
      columnasSanitariasCatalogo(cultivo).map((columna) => {
        const resistencia = buscarResistencia(semilla.resistencia, columna.idEnfermedad);
        return [columna.idEnfermedad, perfilVisibleCatalogo(resistencia)];
      })
    );
    worksheet.addRow({
      id: semilla._id || '',
      snapshot: snapshotSemillaCatalogo(semilla),
      semillero: semilla.semillero || '',
      variedad: semilla.variedad || '',
      ciclo: semilla.ciclo || '',
      campania: semilla.campania || '',
      ...perfiles,
      fuenteActualizacion: '',
      campaniaFuente: '',
      fechaFuente: '',
      estado: '',
      confianza: '',
      observacionesActualizacion: '',
    });
  }

  aplicarEstiloHojaCultivo(worksheet, columnas, ordenadas.length);
}

function aplicarEstiloHojaCultivo(
  worksheet: ExcelJS.Worksheet,
  columnas: IColumnaLibro[],
  cantidadFilas: number
): void {
  const header = worksheet.getRow(1);
  header.height = 34;
  header.font = { bold: true, color: { argb: 'FF111827' } };
  header.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };
  header.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_ENCABEZADO },
    };
    cell.border = bordeFino();
  });

  const finalColumna = columnas.length;
  const columnaSemillero = columnas.findIndex((item) => item.key === 'semillero') + 1;
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    // Aunque estén ocultos, ID y snapshot deben moverse con la fila cuando
    // el usuario ordena desde Excel.
    to: { row: Math.max(1, cantidadFilas + 1), column: finalColumna },
  };

  const filaMaximaValidacion = Math.min(2_001, Math.max(200, cantidadFilas + 101));
  for (let rowNumber = 2; rowNumber <= filaMaximaValidacion; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 22;
    for (let columnNumber = 1; columnNumber <= finalColumna; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.border = bordeFino();
      cell.alignment = { vertical: 'middle', wrapText: false };
    }
    row.getCell(columnaSemillero).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_SEMILLERO },
    };
  }

  columnas.forEach((columna, index) => {
    const columnNumber = index + 1;
    if (!columna.enfermedad) return;
    const headerCell = worksheet.getRow(1).getCell(columnNumber);
    headerCell.note = columna.enfermedad.editable
      ? `Categorías admitidas: ${[...columna.enfermedad.perfilesPermitidos, 'DESCONOCIDA', 'SIN_REGISTRO'].join(
          ', '
        )}. Los factores se calculan en el backend.`
      : columna.enfermedad.motivoSoloLectura || 'Columna informativa: no se convierte automáticamente a una categoría.';
    for (let rowNumber = 2; rowNumber <= filaMaximaValidacion; rowNumber += 1) {
      const cell = worksheet.getRow(rowNumber).getCell(columnNumber);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: columna.enfermedad.editable ? COLOR_EDITABLE : COLOR_SOLO_LECTURA,
        },
      };
      if (columna.enfermedad.editable) {
        const values = [...columna.enfermedad.perfilesPermitidos, 'DESCONOCIDA', 'SIN_REGISTRO'];
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${values.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Categoría no válida',
          error: `Use una de estas categorías: ${values.join(', ')}.`,
        };
      }
    }
  });

  const estadoCol = columnas.findIndex((item) => item.key === 'estado') + 1;
  const confianzaCol = columnas.findIndex((item) => item.key === 'confianza') + 1;
  for (let rowNumber = 2; rowNumber <= filaMaximaValidacion; rowNumber += 1) {
    worksheet.getRow(rowNumber).getCell(estadoCol).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${ESTADOS.join(',')}"`],
    };
    worksheet.getRow(rowNumber).getCell(confianzaCol).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CONFIANZAS.join(',')}"`],
    };
  }

  columnas
    .map((item, index) => ({ key: item.key, columnNumber: index + 1 }))
    .filter((item) => item.key === 'id' || item.key === 'snapshot')
    .forEach(({ columnNumber }) => {
      worksheet.getColumn(columnNumber).eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLOR_TECNICO },
        };
      });
    });
}

function crearHojaDetalle(workbook: ExcelJS.Workbook, semillas: ISemilla[]): void {
  const worksheet = workbook.addWorksheet(HOJA_DETALLE_CATALOGO, {
    state: 'veryHidden',
  });
  const headers = [
    '_CHAMAN_ID',
    'CULTIVO',
    'ID_ENFERMEDAD',
    'ENFERMEDAD',
    'PERFIL',
    'MULTIPLICADOR_DERIVADO',
    'INDICE_DERIVADO',
    'ESTADO',
    'CONFIANZA',
    'FUENTE',
    'FUENTE_URL',
    'CAMPAÑA_FUENTE',
    'FECHA_FUENTE',
    'OBSERVACIONES',
    'METODO',
    'VALOR_CAMPO',
    'UNIDAD',
    'INTERPRETACION',
    'PATOTIPOS_RESISTENTES',
    'PATOTIPOS_SUSCEPTIBLES',
  ];
  worksheet.addRow(headers);
  for (const semilla of semillas) {
    for (const resistencia of semilla.resistencia || []) {
      worksheet.addRow([
        semilla._id || '',
        semilla.cultivo || '',
        resistencia.idEnfermedad || '',
        resistencia.enfermedad || '',
        resistencia.perfil || '',
        resistencia.multiplicador ?? '',
        resistencia.indiceResistencia ?? '',
        resistencia.estado || '',
        resistencia.confianza || '',
        resistencia.fuente || '',
        resistencia.fuenteUrl || '',
        resistencia.campaniaFuente || '',
        resistencia.fechaFuente || '',
        resistencia.observaciones || '',
        resistencia.detalleSanitario?.metodo || '',
        resistencia.detalleSanitario?.valorCampo ?? '',
        resistencia.detalleSanitario?.unidad || '',
        resistencia.detalleSanitario?.interpretacion || '',
        (resistencia.detalleSanitario?.patotiposResistentes || []).join(';'),
        (resistencia.detalleSanitario?.patotiposSusceptibles || []).join(';'),
      ]);
    }
  }
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns = headers.map((header) => ({
    width: Math.max(16, Math.min(50, header.length + 4)),
  }));
}

function buscarResistencia(resistencias: IResistencia[] | undefined, idEnfermedad: string): IResistencia | undefined {
  return (resistencias || []).find((item) => enfermedadCoincide(item, idEnfermedad));
}

function bordeFino(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: 'FFD1D5DB' },
  };
  return { top: side, left: side, bottom: side, right: side };
}

export function leerFilasCatalogoCultivos(workbook: ExcelJS.Workbook): IFilaCatalogoCultivos[] {
  validarFormato(workbook);
  const filas: IFilaCatalogoCultivos[] = [];
  for (const cultivo of ORDEN_HOJAS) {
    const worksheet = workbook.getWorksheet(cultivo);
    if (!worksheet) {
      throw new Error(`Falta la hoja obligatoria ${cultivo}.`);
    }
    filas.push(...leerHojaCultivo(worksheet, cultivo));
  }
  return filas;
}

function validarFormato(workbook: ExcelJS.Workbook): void {
  const meta = workbook.getWorksheet(HOJA_META_CATALOGO);
  const format = valorCeldaExcel(meta?.getCell('B1').value);
  if (valorCeldaExcel(meta?.getCell('A1').value) !== 'FORMATO_CHAMAN' || format !== CATALOGO_CULTIVOS_FORMATO_VERSION) {
    throw new Error(
      'El archivo no corresponde al formato vigente del catálogo de cultivos de Chamán. Exporte uno nuevo y vuelva a aplicar sus cambios.'
    );
  }
}

function leerHojaCultivo(worksheet: ExcelJS.Worksheet, cultivo: Cultivo): IFilaCatalogoCultivos[] {
  const encabezados = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const key = normalizarEncabezado(valorCeldaExcel(cell.value));
    if (key) encabezados.set(key, column);
  });

  const requeridos = [
    ENCABEZADOS_CATALOGO.id,
    ENCABEZADOS_CATALOGO.snapshot,
    ENCABEZADOS_CATALOGO.semillero,
    ENCABEZADOS_CATALOGO.variedad,
    ENCABEZADOS_CATALOGO.ciclo,
    ENCABEZADOS_CATALOGO.campania,
    ...columnasSanitariasCatalogo(cultivo).map((item) => item.encabezado),
  ];
  for (const requerido of requeridos) {
    if (!encabezados.has(normalizarEncabezado(requerido))) {
      throw new Error(`La hoja ${cultivo} no contiene la columna obligatoria ${requerido}.`);
    }
  }

  const read = (row: ExcelJS.Row, header: string): string => {
    const column = encabezados.get(normalizarEncabezado(header));
    return column ? String(valorCeldaExcel(row.getCell(column).value) ?? '').trim() : '';
  };
  const result: IFilaCatalogoCultivos[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const perfiles = Object.fromEntries(
      columnasSanitariasCatalogo(cultivo)
        .map((item) => [item.idEnfermedad, normalizarPerfilCatalogo(read(row, item.encabezado))])
        .filter(([, value]) => !!value)
    );
    const base = {
      semillero: read(row, ENCABEZADOS_CATALOGO.semillero),
      variedad: read(row, ENCABEZADOS_CATALOGO.variedad),
      ciclo: read(row, ENCABEZADOS_CATALOGO.ciclo),
      campania: read(row, ENCABEZADOS_CATALOGO.campania),
    };
    const tieneContenido = Object.values(base).some(Boolean) || Object.keys(perfiles).length > 0;
    if (!tieneContenido) return;
    result.push({
      fila: rowNumber,
      hoja: cultivo,
      id: read(row, ENCABEZADOS_CATALOGO.id) || undefined,
      snapshot: read(row, ENCABEZADOS_CATALOGO.snapshot) || undefined,
      ...base,
      campania: base.campania || undefined,
      perfiles,
      fuenteActualizacion: read(row, ENCABEZADOS_CATALOGO.fuenteActualizacion) || undefined,
      campaniaFuente: read(row, ENCABEZADOS_CATALOGO.campaniaFuente) || undefined,
      fechaFuente: read(row, ENCABEZADOS_CATALOGO.fechaFuente) || undefined,
      estado: (read(row, ENCABEZADOS_CATALOGO.estado) as TEstadoResistencia) || undefined,
      confianza: (read(row, ENCABEZADOS_CATALOGO.confianza) as TConfianzaResistencia) || undefined,
      observacionesActualizacion: read(row, ENCABEZADOS_CATALOGO.observacionesActualizacion) || undefined,
    });
  });
  return result;
}

function normalizarEncabezado(value?: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function valorCeldaExcel(value: ExcelJS.CellValue | undefined): unknown {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'object') return value;
  const structured = value as {
    result?: unknown;
    text?: string;
    richText?: { text?: string }[];
  };
  if ('result' in structured) return structured.result ?? '';
  if ('text' in structured) return structured.text ?? '';
  if (Array.isArray(structured.richText)) {
    return structured.richText.map((item) => item.text || '').join('');
  }
  return String(value);
}

export function cultivosLibroCatalogo(): readonly Cultivo[] {
  return ORDEN_HOJAS.filter((item) => (CULTIVOS_DISPONIBLES as readonly string[]).includes(item));
}
