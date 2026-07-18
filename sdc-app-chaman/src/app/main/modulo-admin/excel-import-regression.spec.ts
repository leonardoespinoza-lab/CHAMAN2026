import ExcelJS from 'exceljs';
import { ListadoFenologiaComponent } from './fenologia/listado-fenologia/listado-fenologia.component';
import { ListadoSemillasComponent } from './semillas/listado-semillas/listado-semillas.component';

describe('Importacion administrativa XLSX segura', () => {
  function dependencias(): any[] {
    return Array.from({ length: 9 }, () => ({}));
  }

  it('recupera encabezados y valores de una planilla de semillas', () => {
    const component = new (ListadoSemillasComponent as any)(...dependencias());
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Semillas');
    worksheet.addRow(['cultivo', 'variedad', 'resistencia']);
    worksheet.addRow(['Trigo', 'ACA 603', '[{"enfermedad":"Roya"}]']);

    const rows = component.filasExcel(worksheet);

    expect(rows).toEqual([
      {
        cultivo: 'Trigo',
        variedad: 'ACA 603',
        resistencia: '[{"enfermedad":"Roya"}]',
      },
    ]);
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
