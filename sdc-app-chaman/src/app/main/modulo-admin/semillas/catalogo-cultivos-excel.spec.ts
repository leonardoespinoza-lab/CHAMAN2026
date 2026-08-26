import ExcelJS from 'exceljs';
import { CATALOGO_CULTIVOS_FORMATO_VERSION, ISemilla, snapshotSemillaCatalogo } from 'modelos/src';
import {
  crearLibroCatalogoCultivos,
  cultivosLibroCatalogo,
  ENCABEZADOS_CATALOGO,
  HOJA_DETALLE_CATALOGO,
  HOJA_LEEME_CATALOGO,
  HOJA_META_CATALOGO,
  leerFilasCatalogoCultivos,
} from './catalogo-cultivos-excel';

describe('Catálogo de cultivos XLSX ancho', () => {
  const trigo: ISemilla = {
    _id: '66f000000000000000000001',
    cultivo: 'Trigo',
    semillero: 'DON MARIO',
    variedad: 'DM ACACIA',
    ciclo: 'LARGO',
    campania: '2025-2026',
    resistencia: [
      {
        idEnfermedad: 'trigo.roya_hoja',
        enfermedad: 'Roya de la Hoja',
        perfil: 'R',
        multiplicador: 0.05,
        indiceResistencia: 1,
        estado: 'observada',
        confianza: 'alta',
        fuente: 'Ensayo varietal',
        campaniaFuente: '2025-2026',
      },
    ],
  };

  it('genera una hoja visible por cultivo y conserva el detalle sin JSON', () => {
    const workbook = crearLibroCatalogoCultivos([trigo]);

    expect(cultivosLibroCatalogo().length).toBe(10);
    for (const cultivo of cultivosLibroCatalogo()) {
      expect(workbook.getWorksheet(cultivo)).toBeDefined();
    }
    expect(workbook.getWorksheet(HOJA_META_CATALOGO)?.state).toBe('veryHidden');
    expect(workbook.getWorksheet(HOJA_DETALLE_CATALOGO)?.state).toBe('veryHidden');
    expect(workbook.worksheets[0].name).toBe(HOJA_LEEME_CATALOGO);
    expect(workbook.getWorksheet(HOJA_LEEME_CATALOGO)?.state).toBe('visible');

    const worksheet = workbook.getWorksheet('Trigo')!;
    expect(worksheet.getCell('A1').value).toBe('SEMILLERO');
    expect(worksheet.getCell('B1').value).toBe('VARIEDAD');
    const idColumn = (worksheet.getRow(1).values as unknown[]).findIndex((value) => value === ENCABEZADOS_CATALOGO.id);
    const snapshotColumn = (worksheet.getRow(1).values as unknown[]).findIndex(
      (value) => value === ENCABEZADOS_CATALOGO.snapshot
    );
    expect(worksheet.getColumn(idColumn).hidden).toBeTrue();
    expect(worksheet.getColumn(snapshotColumn).hidden).toBeTrue();
    expect((worksheet.autoFilter as { to: { column: number } }).to.column).toBe(snapshotColumn);
    const headers = (worksheet.getRow(1).values as unknown[]).map(String);
    expect(headers).toContain('ROYA DE LA HOJA');
    expect(headers).not.toContain('resistencia');
    expect(String(worksheet.getRow(2).values)).not.toContain('{');
  });

  it('hace round-trip sin perder identidad ni perfiles visibles', async () => {
    const exported = crearLibroCatalogoCultivos([trigo]);
    const buffer = await exported.xlsx.writeBuffer();
    const imported = new ExcelJS.Workbook();
    await imported.xlsx.load(buffer);

    const row = leerFilasCatalogoCultivos(imported).find((item) => item.id === trigo._id);

    expect(row).toBeDefined();
    expect(row).toEqual(
      jasmine.objectContaining({
        hoja: 'Trigo',
        semillero: 'DON MARIO',
        variedad: 'DM ACACIA',
        ciclo: 'LARGO',
        campania: '2025-2026',
      })
    );
    expect(row?.snapshot).toMatch(/^v1-[a-f0-9]{16}$/);
    expect(row?.perfiles['trigo.roya_hoja']).toBe('R');
    expect(row?.perfiles['trigo.fusarium_espiga']).toBe('SIN_REGISTRO');
  });

  it('lee una variedad nueva agregada a la hoja de Trigo', () => {
    const workbook = crearLibroCatalogoCultivos([]);
    const worksheet = workbook.getWorksheet('Trigo')!;
    worksheet.addRow({
      semillero: 'DON MARIO',
      variedad: 'DM RADAL',
      ciclo: 'CORTO',
      campania: '2026-2027',
      'trigo.roya_hoja': 'MR',
      'trigo.roya_tallo': 'R',
      fuenteActualizacion: 'Catálogo oficial 2026',
      campaniaFuente: '2026-2027',
      estado: 'historica',
      confianza: 'media',
    });

    const row = leerFilasCatalogoCultivos(workbook).find((item) => item.variedad === 'DM RADAL');

    expect(row?.id).toBeUndefined();
    expect(row?.perfiles['trigo.roya_hoja']).toBe('MR');
    expect(row?.fuenteActualizacion).toBe('Catálogo oficial 2026');
  });

  it('rechaza un archivo no versionado antes de leer filas', () => {
    const workbook = crearLibroCatalogoCultivos([]);
    workbook.getWorksheet(HOJA_META_CATALOGO)!.getCell('B1').value = 'formato-obsoleto';

    expect(() => leerFilasCatalogoCultivos(workbook)).toThrowError(/formato vigente/i);
  });

  it('publica explícitamente la versión esperada', () => {
    const workbook = crearLibroCatalogoCultivos([]);
    expect(workbook.getWorksheet(HOJA_META_CATALOGO)?.getCell('B1').value).toBe(CATALOGO_CULTIVOS_FORMATO_VERSION);
    expect(ENCABEZADOS_CATALOGO.semillero).toBe('SEMILLERO');
  });

  it('ignora el id virtual de raíz pero protege ids científicos anidados', () => {
    const base = {
      ...trigo,
      id: 'virtual-de-mongoose-a',
      fichaVarietal: {
        documentos: [{ id: 'fuente-a', titulo: 'Ensayo', url: 'https://inta.gob.ar' }],
      },
    } as unknown as ISemilla;
    const otroIdVirtual = {
      ...base,
      id: 'virtual-de-mongoose-b',
    } as unknown as ISemilla;
    const otraFuente = {
      ...base,
      fichaVarietal: {
        documentos: [{ id: 'fuente-b', titulo: 'Ensayo', url: 'https://inta.gob.ar' }],
      },
    } as unknown as ISemilla;

    expect(snapshotSemillaCatalogo(base)).toBe(snapshotSemillaCatalogo(otroIdVirtual));
    expect(snapshotSemillaCatalogo(base)).not.toBe(snapshotSemillaCatalogo(otraFuente));
  });
});
