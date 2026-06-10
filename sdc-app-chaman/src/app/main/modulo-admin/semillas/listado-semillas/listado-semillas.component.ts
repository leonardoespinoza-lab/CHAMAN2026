import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ICreateSemilla, IListado, IQueryParam, ISemilla } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import { SemillaService } from '../../../../auxiliares/http/semilla.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-semillas',
  imports: [SharedModule],
  templateUrl: './listado-semillas.component.html',
  styleUrl: './listado-semillas.component.scss',
})
export class ListadoSemillasComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('table') table: any;

  public loading = false;
  public importing = false;
  public name = ListadoSemillasComponent.name;
  public datos: ISemilla[] = [];
  public totalCount = 0;
  public datos$?: Subscription;

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
    private service: SemillaService,
    private params: ParamsService,
    private router: Router
  ) {}

  public async create() {
    this.params.set('editSemilla', false);
    this.router.navigate(['semillas', 'crear']);
  }

  public async edit(data: ISemilla) {
    this.params.set('editSemilla', data);
    this.router.navigate(['semillas', 'editar', data._id]);
  }

  public async delete(dato: ISemilla): Promise<void> {
    this.confirmationService.confirm({
      header: this.translate.instant('Por favor, confirme la acción'),
      message: this.translate.instant('¿Desea eliminar la semilla?'),
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
          this.listado.deleteEntityItem('semillas', dato._id!);

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
      semillero: s.semillero,
      variedad: s.variedad,
      ciclo: s.ciclo,
      campania: s.campania || '',
      resistencia: JSON.stringify(s.resistencia || []),
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Semillas');
    XLSX.writeFile(wb, 'cultivo.xlsx');
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
          let resistencia: any[] = [];
          if (row['resistencia']) {
            try {
              resistencia = JSON.parse(String(row['resistencia']));
            } catch {
              resistencia = [];
            }
          }
          const semilla: ICreateSemilla = {
            cultivo: row['cultivo'],
            semillero: row['semillero'],
            variedad: row['variedad'],
            ciclo: String(row['ciclo'] || '').toUpperCase(),
            campania: row['campania'] || undefined,
            resistencia,
          };
          const created = await this.service.crear(semilla);

          // Solo actualiza el item en cache
          this.listado.createEntityItem('semillas', created);

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
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'cultivo semillero variedad',
    };    

    this.datos$?.unsubscribe();
    this.datos$ = this.listado.subscribe<IListado<ISemilla>>('semillas', queryParams).subscribe((data) => {
      this.totalCount = data.totalCount;
      this.datos = data.datos;
    });
    await this.listado.getLastValue('semillas', queryParams);
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
