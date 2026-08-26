import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import ExcelJS from 'exceljs';
import saveAs from 'file-saver';
import {
  CATALOGO_CULTIVOS_FORMATO_VERSION,
  getEnfermedadPorId,
  IListado,
  IQueryParam,
  IResultadoImportacionCatalogoCultivos,
  ISemilla,
} from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { Subscription } from 'rxjs';
import { SemillaService } from '../../../../auxiliares/http/semilla.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { crearLibroCatalogoCultivos, leerFilasCatalogoCultivos } from '../catalogo-cultivos-excel';

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

  public async exportarExcel(): Promise<void> {
    const workbook = crearLibroCatalogoCultivos(this.datos);
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer as unknown as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'catalogo-cultivos-chaman.xlsx'
    );
  }

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
      const filas = leerFilasCatalogoCultivos(workbook);
      const preview = await this.service.importarCatalogo({
        formatoVersion: CATALOGO_CULTIVOS_FORMATO_VERSION,
        modo: 'previsualizar',
        filas,
      });
      if (preview.errores.length) {
        throw new Error(this.detalleErroresImportacion(preview));
      }
      if (!preview.altas && !preview.actualizaciones) {
        this.helper.notifSuccess(
          this.translate.instant('El archivo coincide con la base actual. No se realizó ninguna escritura.')
        );
        return;
      }
      const confirmar = await this.confirmarImportacion(preview);
      if (!confirmar) return;
      const result = await this.service.importarCatalogo({
        formatoVersion: CATALOGO_CULTIVOS_FORMATO_VERSION,
        modo: 'confirmar',
        planHash: preview.planHash,
        filas,
      });
      if (result.errores.length) {
        throw new Error(this.detalleErroresImportacion(result));
      }
      this.listado.borrarCache();
      await this.listar();
      this.helper.notifSuccess(
        this.translate.instant(
          `Catálogo actualizado: ${result.altas} altas y ${result.actualizaciones} actualizaciones.`
        )
      );
    } catch (e) {
      this.helper.notifError(e);
    } finally {
      this.importing = false;
    }
  }

  private detalleErroresImportacion(result: IResultadoImportacionCatalogoCultivos): string {
    const detalle = result.errores
      .slice(0, 10)
      .map((item) => `${item.hoja}, fila ${item.fila}${item.campo ? `, ${item.campo}` : ''}: ${item.mensaje}`)
      .join('\n');
    const restantes = Math.max(0, result.errores.length - 10);
    return `No se importó nada. Corrija ${result.errores.length} error(es):\n${detalle}${
      restantes ? `\n...y ${restantes} error(es) más.` : ''
    }`;
  }

  private confirmarImportacion(preview: IResultadoImportacionCatalogoCultivos): Promise<boolean> {
    const detalle = preview.cambios
      .slice(0, 6)
      .map((cambio) => {
        const enfermedades = cambio.enfermedades.map((id) => getEnfermedadPorId(id)?.nombre || id).join(', ');
        return `${cambio.tipo === 'alta' ? 'ALTA' : 'ACTUALIZACIÓN'}: ${cambio.cultivo} · ${cambio.semillero} · ${
          cambio.variedad
        }${enfermedades ? ` (${enfermedades})` : ''}`;
      })
      .join(' | ');
    const restantes = Math.max(0, preview.cambios.length - 6);
    return new Promise((resolve) => {
      this.confirmationService.confirm({
        header: this.translate.instant('Confirmar actualización del catálogo'),
        message: this.translate.instant(
          `${preview.altas} altas, ${preview.actualizaciones} actualizaciones y ${preview.sinCambios} filas sin cambios. No se eliminarán variedades ni datos ausentes.${
            detalle ? ` Detalle: ${detalle}${restantes ? ` | …y ${restantes} cambio(s) más.` : ''}` : ''
          }`
        ),
        icon: 'pi pi-exclamation-triangle',
        closable: true,
        closeOnEscape: true,
        rejectButtonProps: {
          label: this.translate.instant('Cancelar'),
          severity: 'secondary',
          outlined: true,
        },
        acceptButtonProps: {
          label: this.translate.instant('Aplicar cambios'),
          severity: 'warn',
        },
        accept: () => resolve(true),
        reject: () => resolve(false),
      });
    });
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
