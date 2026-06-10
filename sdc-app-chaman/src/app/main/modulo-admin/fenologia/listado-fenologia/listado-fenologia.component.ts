import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ICreateFenologia, IListado, IQueryParam, IFenologia, IPopulate } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
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
  public exportarExcel(): void {
    const filas = this.datos.map((s) => ({
      cultivo: s.cultivo,
      departamento: s.departamento?.nombre || '',
      ciclo: s.ciclo,
      diaSiembra: s.diaSiembra,
      mesSiembra: s.mesSiembra || '',
      etapas: JSON.stringify(
        Object.entries(s.etapas || {}).map(([clave, valor]) => ({
          [clave]: valor
        }))
      )
    }));

    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fenología');

    const now = new Date();

    const fecha = now.toISOString().slice(0, 10); // yyyy-mm-dd
    const hora = String(now.getHours()).padStart(2, '0');
    const minutos = String(now.getMinutes()).padStart(2, '0');

    const nombreArchivo = `fenologia_${fecha}_${hora}-${minutos}.xlsx`;

    // Nombre con fecha
    XLSX.writeFile(wb, nombreArchivo);
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
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);

      let ok = 0;
      let err = 0;
      for (const row of rows) {
        try {
          let etapasObj: Record<string, number> = {};
          if (row['etapas']) {
            try {
              const etapasArray = JSON.parse(String(row['etapas']));

              if (Array.isArray(etapasArray)) {
                etapasObj = etapasArray.reduce(
                  (acc: Record<string, number>, item: any) => {
                    const clave = Object.keys(item)[0];

                    if (clave) {
                      acc[clave] = Number(item[clave]) || 0;
                    }

                    return acc;
                  },
                  {}
                );
              }
            } catch (error) {
              console.error('Error parseando etapas:', error);
              etapasObj = {};
            }
          }

         

          const nombreDepto = String(row['departamento']).trim().toUpperCase();

          const depto = this.datos.find(
            (d) => d.departamento?.nombre?.toUpperCase() === nombreDepto
          )?.departamento;

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
      this.helper.notifSuccess(
        this.translate.instant(`Importadas: ${ok}`) + (err ? ` | Errores: ${err}` : '')
      );
    } catch (e) {
      this.helper.notifError(e);
    }
    this.importing = false;
  }

  private async listar(): Promise<void> {

    const populate: IPopulate[] = [
      {
        path: 'departamento',
        select: 'nombre',
      }
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
      
      this.datos = data.datos.map(d => ({
        ...d,
        departamentoNombre: d.departamento?.nombre || ''
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
