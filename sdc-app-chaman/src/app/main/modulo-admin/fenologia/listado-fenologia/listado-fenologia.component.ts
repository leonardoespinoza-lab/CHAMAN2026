import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import ExcelJS from 'exceljs';
import saveAs from 'file-saver';
import { ICreateFenologia, IListado, IQueryParam, IFenologia, IPopulate } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { FenologiaService } from '../../../../auxiliares/http/fenologia.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-fenologia',
  imports: [SharedModule],
  templateUrl: './listado-fenologia.component.html',
  styleUrl: './listado-fenologia.component.scss',
})
export class ListadoFenologiaComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('table') table: any;

  public loading = false;
  public importing = false;
  public name = ListadoFenologiaComponent.name;
  public datos: IFenologia[] = [];
  public totalCount = 0;
  public datos$?: Subscription;

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: FenologiaService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editFenologia', false);
    this.router.navigate(['fenologias', 'crear']);
  }

  public async edit(data: IFenologia) {
    this.params.set('editFenologia', data);
    this.router.navigate(['fenologias', 'editar', data._id]);
  }

  public async delete(dato: IFenologia): Promise<void> {
    this.confirmationService.confirm({
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar la fenologia?'),
      closable: true,
      closeOnEscape: true,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: this.translate.instant('Cancelar'),
        severity: 'secondary',
        outlined: true,
      },
      acceptButtonProps: {
        label: this.translate.instant('Aceptar'),
      },
      accept: async () => {
        this.loading = true;
        try {
          await this.service.eliminar(dato._id!);

          // Solo elimina el item en cache
          this.listado.deleteEntityItem('fenologias', dato._id!);

          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
        } catch (error) {
          this.helper.notifError(error);
        }
        this.loading = false;
      },
    });
  }

  // Excel export
  public async exportarExcel(): Promise<void> {
    const filas = this.datos.map((s) => ({
      cultivo: s.cultivo,
      departamento: s.departamento?.nombre || '',
      ciclo: s.ciclo,
      diaSiembra: s.diaSiembra,
      mesSiembra: s.mesSiembra || '',
      etapas: JSON.stringify(
        Object.entries(s.etapas || {}).map(([clave, valor]) => ({
          [clave]: valor,
        }))
      ),
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Fenologia');
    worksheet.columns = [
      { header: 'cultivo', key: 'cultivo', width: 20 },
      { header: 'departamento', key: 'departamento', width: 28 },
      { header: 'ciclo', key: 'ciclo', width: 20 },
      { header: 'diaSiembra', key: 'diaSiembra', width: 14 },
      { header: 'mesSiembra', key: 'mesSiembra', width: 14 },
      { header: 'etapas', key: 'etapas', width: 60 },
    ];
    worksheet.addRows(filas);
    worksheet.getRow(1).font = { bold: true };
    worksheet.autoFilter = { from: 'A1', to: 'F1' };

    const now = new Date();

    const fecha = now.toISOString().slice(0, 10); // yyyy-mm-dd
    const hora = String(now.getHours()).padStart(2, '0');
    const minutos = String(now.getMinutes()).padStart(2, '0');

    const nombreArchivo = `fenologia_${fecha}_${hora}-${minutos}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer as unknown as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      nombreArchivo
    );
  }

  // Excel import
  public triggerImport(): void {
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  public async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.importing = true;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error('El archivo no contiene hojas.');
      const rows = this.filasExcel(worksheet);

      let ok = 0;
      let err = 0;
      for (const row of rows) {
        try {
          let etapasObj: Record<string, number> = {};
          if (row['etapas']) {
            try {
              const etapasArray = JSON.parse(String(row['etapas']));

              if (Array.isArray(etapasArray)) {
                etapasObj = etapasArray.reduce((acc: Record<string, number>, item: any) => {
                  const clave = Object.keys(item)[0];

                  if (clave) {
                    acc[clave] = Number(item[clave]) || 0;
                  }

                  return acc;
                }, {});
              }
            } catch (error) {
              console.error('Error parseando etapas:', error);
              etapasObj = {};
            }
          }

          const nombreDepto = String(row['departamento']).trim().toUpperCase();

          const depto = this.datos.find((d) => d.departamento?.nombre?.toUpperCase() === nombreDepto)?.departamento;

          if (!depto) {
            console.warn(`Departamento no encontrado: ${nombreDepto}`);
            continue; // o continuás con la siguiente fila
          }

          const fenologia: ICreateFenologia = {
            cultivo: row['cultivo'],
            idDepartamento: depto._id,
            ciclo: String(row['ciclo'] || '').toUpperCase(),
            diaSiembra: row['diaSiembra'],
            mesSiembra: row['mesSiembra'],
            etapas: etapasObj,
          };
          const created = await this.service.crear(fenologia);

          // Solo actualiza el item en cache
          this.listado.createEntityItem('fenologias', created);

          ok++;
        } catch {
          err++;
        }
      }
      this.helper.notifSuccess(this.translate.instant(`Importadas: ${ok}`) + (err ? ` | Errores: ${err}` : ''));
    } catch (e) {
      this.helper.notifError(e);
    }
    this.importing = false;
  }

  private filasExcel(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
    const encabezados = (worksheet.getRow(1).values as ExcelJS.CellValue[])
      .slice(1)
      .map((value) => String(this.valorCeldaExcel(value) || '').trim());
    const filas: Record<string, any>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const fila: Record<string, any> = {};
      encabezados.forEach((encabezado, index) => {
        if (encabezado) {
          fila[encabezado] = this.valorCeldaExcel(row.getCell(index + 1).value);
        }
      });
      if (Object.values(fila).some((value) => value !== '' && value != null)) {
        filas.push(fila);
      }
    });
    return filas;
  }

  private valorCeldaExcel(value: ExcelJS.CellValue): unknown {
    if (value == null) return '';
    if (value instanceof Date || typeof value !== 'object') return value;
    const structured = value as any;
    if ('result' in structured) return structured.result ?? '';
    if ('text' in structured) return structured.text ?? '';
    if (Array.isArray(structured.richText)) {
      return structured.richText.map((item: any) => item.text || '').join('');
    }
    return String(value);
  }

  private async listar(): Promise<void> {
    const populate: IPopulate[] = [
      {
        path: 'departamento',
        select: 'nombre',
      },
    ];

    const queryParams: IQueryParam = {
      populate: JSON.stringify(populate),
      page: 0,
      limit: 0,
      sort: 'cultivo departamento ciclo',
    };

    this.datos$?.unsubscribe();
    this.datos$ = this.listado.subscribe<IListado<IFenologia>>('fenologias', queryParams).subscribe((data) => {
      this.totalCount = data.totalCount;

      this.datos = data.datos.map((d) => ({
        ...d,
        departamentoNombre: d.departamento?.nombre || '',
      }));
    });
    await this.listado.getLastValue('fenologias', queryParams);
  }

  public async ngOnInit() {
    this.loading = true;
    await this.listar();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }
}
