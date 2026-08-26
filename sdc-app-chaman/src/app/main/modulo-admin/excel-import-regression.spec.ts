import ExcelJS from 'exceljs';
import { ListadoFenologiaComponent } from './fenologia/listado-fenologia/listado-fenologia.component';
import {
  crearLibroCatalogoCultivos,
  leerFilasCatalogoCultivos,
} from './semillas/catalogo-cultivos-excel';

describe('Importacion administrativa XLSX segura', () => {
  function dependencias(): any[] {
    return Array.from({ length: 9 }, () => ({}));
  }

  it('recupera encabezados y valores del catálogo ancho de cultivos', () => {
    const workbook = crearLibroCatalogoCultivos([]);
    workbook.getWorksheet('Trigo')!.addRow({
      semillero: 'ACA',
      variedad: 'ACA 603',
      ciclo: 'CORTO',
      campania: '2026-2027',
      'trigo.roya_hoja': 'R',
      fuenteActualizacion: 'Catálogo oficial 2026',
    });

    const row = leerFilasCatalogoCultivos(workbook).find(
      (item) => item.variedad === 'ACA 603'
    );

    expect(row).toEqual(
      jasmine.objectContaining({
        hoja: 'Trigo',
        semillero: 'ACA',
        variedad: 'ACA 603',
        ciclo: 'CORTO',
        campania: '2026-2027',
        fuenteActualizacion: 'Catálogo oficial 2026',
      })
    );
    expect(row?.perfiles['trigo.roya_hoja']).toBe('R');
  });

  it('recupera numeros y JSON de una planilla fenologica', () => {
    const component = new (ListadoFenologiaComponent as any)(...dependencias());
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Fenologia');
    worksheet.addRow(['cultivo', 'diaSiembra', 'mesSiembra', 'etapas']);
    worksheet.addRow(['Arveja', 1, 7, '[{"S-E":140}]']);

    const rows = component.filasExcel(worksheet);

    expect(rows).toEqual([
      {
        cultivo: 'Arveja',
        diaSiembra: 1,
        mesSiembra: 7,
        etapas: '[{"S-E":140}]',
      },
    ]);
  });
});
