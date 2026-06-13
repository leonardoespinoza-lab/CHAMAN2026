import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ICrono, IFertilizacion, IFumigacion, IQueryParam, ISiembra } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { FenologiaService } from '../../../../auxiliares/http/fenologia.service';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';
import { CardClimaLoteComponent } from './card-clima-lote/card-clima-lote.component';
import { CardDispositivosComponent } from './card-dispositivos/card-dispositivos.component';
import { CardEnfermedadesComponent } from './card-enfermedades/card-enfermedades.component';
import { CardEtapaFenologicaComponent } from './card-etapa-fenologica/card-etapa-fenologica.component';
import { CardEtapasFenologicasComponent } from './card-etapas-fenologicas/card-etapas-fenologicas.component';
import { CardHuellaHidricaComponent } from './card-huella-hidrica/card-huella-hidrica.component';
import { CardMalezasComponent } from './card-malezas/card-malezas.component';
import { CardNDVIComponent } from './card-ndvi/card-ndvi.component';
import { CardRendimientoComponent } from './card-rendimiento/card-rendimiento.component';
import { CardRiegoComponent } from './card-riego/card-riego.component';
import { CardUltimaFertilizacionComponent } from './card-ultima-fertilizacion/card-ultima-fertilizacion.component';
import { CardUltimaFumigacionComponent } from './card-ultima-fumigacion/card-ultima-fumigacion.component';
import { DrawerListadoSiembrasComponent } from './drawer-listado-siembras/drawer-listado-siembras.component';

const CULTIVOS_CON_PREDICCION_MALEZAS = ['Soja', 'Trigo', 'Maiz'];

export interface IDetalleSiembra extends ISiembra {
  fumigaciones?: IFumigacion[];
}

export interface IDetallesLote extends ILoteTabla {
  fertilizaciones?: IFertilizacion[];
}

@Component({
  selector: 'app-detalles-lote',
  imports: [
    SharedModule,
    CardEtapaFenologicaComponent,
    CardUltimaFumigacionComponent,
    CardDispositivosComponent,
    CardEnfermedadesComponent,
    CardClimaLoteComponent,
    CardRiegoComponent,
    CardHuellaHidricaComponent,
    CardUltimaFertilizacionComponent,
    CardRendimientoComponent,
    DrawerListadoSiembrasComponent,
    CardNDVIComponent,
    CardEtapasFenologicasComponent,
    CardMalezasComponent,
  ],
  templateUrl: './detalles-lote.component.html',
  styleUrl: './detalles-lote.component.scss',
})
export class DetallesLoteComponent implements OnInit, OnDestroy {
  public lote?: IDetallesLote;
  public siembra?: IDetalleSiembra;
  public siembraActual? = true;
  public esUltimaEtapa?: boolean;
  public verDrawerSiembras: boolean = false;
  private readonly numeroAr = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

  constructor(
    private paramsService: ParamsService,
    public helper: HelperService,
    public params: ParamsService,
    private router: Router,
    private fenologiaService: FenologiaService,
    private activatedRoute: ActivatedRoute,
    private loteService: LoteService,
    private listado: ListadosService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService
  ) {}

  public verSiembraActual(): void {
    if (!this.lote?.siembra) return;
    this.siembra = JSON.parse(JSON.stringify(this.lote.siembra));
    this.siembraActual = true;
  }

  public selectSiembra(siembra: ISiembra): void {
    if (!siembra) return;
    this.siembra = JSON.parse(JSON.stringify(siembra));
    this.siembraActual = this.lote?.idSiembra === siembra._id;
  }

  public async sembrar(): Promise<void> {
    const data = this.lote;
    this.params.set('sembrarLote', data);
    this.params.set('editSiembra', false);
    this.router.navigate(['lotes', 'sembrar', data?._id]);
  }

  public async editarLote(): Promise<void> {
    if (!this.lote?._id) return;
    this.params.set('editLote', this.lote);
    this.router.navigate(['lotes', 'editar', this.lote._id]);
  }

  public async editarSiembra(): Promise<void> {
    if (!this.lote?._id || !this.siembra?._id) return;
    this.params.set('sembrarLote', this.lote);
    this.params.set('editSiembra', this.siembra);
    this.router.navigate(['lotes', 'sembrar', this.lote._id]);
  }

  public async cosechar(): Promise<void> {
    if (!this.lote?._id || !this.siembra?._id) return;
    this.params.set('cosecharLote', this.lote);
    this.params.set('editCosecha', this.siembra.fechaCosecha ? this.siembra : false);
    this.router.navigate(['lotes', 'cosechar', this.lote._id]);
  }

  public async eliminarLote(event?: Event): Promise<void> {
    event?.stopPropagation();
    if (!this.lote?._id) return;

    this.confirmationService.confirm({
      header: this.translate.instant('Por favor, confirme la accion'),
      message: this.translate.instant('Desea eliminar el lote y sus reportes asociados?'),
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
        severity: 'danger',
      },
      accept: async () => {
        try {
          await this.loteService.eliminar(this.lote!._id!);
          this.listado.deleteEntityItem('lotes', this.lote!._id!);
          this.params.set('detallesLote', null);
          this.helper.notifSuccess(this.translate.instant('Eliminado correctamente'));
          this.router.navigate(['mapa']);
        } catch (error) {
          this.helper.notifError(error);
        }
      },
    });
  }

  public get ubicacionResumen(): string {
    const centro = this.lote?.ubicacion?.centro;
    if (!centro?.lat || !centro?.lng) {
      return 'Sin coordenadas';
    }
    return `${centro.lat.toFixed(4)}, ${centro.lng.toFixed(4)}`;
  }

  public get departamentoResumen(): string {
    const departamento = this.lote?.departamento?.nombre;
    const provincia = this.lote?.departamento?.provincia?.nombre;
    if (departamento && provincia) {
      return `${departamento}, ${provincia}`;
    }
    return departamento || provincia || 'Ubicacion editable en el lote';
  }

  public get superficieResumen(): string {
    const superficie = this.lote?.ubicacion?.superficie;
    if (!superficie || Number.isNaN(superficie)) {
      return 'Sin dato';
    }
    return `${this.numeroAr.format(superficie)} ha`;
  }

  public get sueloResumen(): string {
    const principal =
      this.lote?.texturaEscorrentia ||
      this.lote?.texturaLixiviacion ||
      this.lote?.suelos?.find((suelo) => !!suelo.textura)?.textura;
    return principal || 'Sin dato';
  }

  public get sueloDetalleResumen(): string {
    const niveles = this.lote?.suelos?.filter((suelo) => suelo.textura || suelo.profundidad) || [];
    if (!niveles.length) {
      return 'Puede completarse desde INTA o editarse manualmente';
    }
    return `${niveles.length} nivel${niveles.length === 1 ? '' : 'es'} cargado${niveles.length === 1 ? '' : 's'}`;
  }

  public get rindeResumen(): string {
    const rendimientoSeco = this.siembra?.rendimientoObtenidoKgHaSeco || this.siembra?.rendimientoObtenidoKgHa;
    if (rendimientoSeco) {
      return `${this.numeroAr.format(rendimientoSeco)} kg/ha`;
    }
    if (this.siembra?.rendimiento) {
      return this.siembra.rendimiento;
    }
    return 'Sin historico suficiente';
  }

  public get mostrarPrediccionMalezas(): boolean {
    const cultivo = this.siembra?.semilla?.cultivo;
    return !!cultivo && CULTIVOS_CON_PREDICCION_MALEZAS.includes(cultivo);
  }

  async ngOnInit(): Promise<void> {
    this.lote = this.paramsService.get('detallesLote') || undefined;
    const idLote = this.activatedRoute.snapshot.paramMap.get('id');
    if (idLote) {
      try {
        const loteActualizado = (await this.loteService.listarPorId(idLote)) as IDetallesLote;
        this.lote = {
          ...(this.lote || {}),
          ...loteActualizado,
        };
      } catch (error) {
        this.helper.notifError(error);
      }
    }

    if (this.lote?.siembra && !this.lote.siembra.crono) {
      const cultivo = this.lote.siembra.semilla?.cultivo;
      const ciclo = this.lote.siembra.semilla?.ciclo;
      const idDepartamento = this.lote.departamento?._id;

      const queryParams: IQueryParam = {
        filter: JSON.stringify({ cultivo, ciclo, idDepartamento }),
      };

      const result = await this.fenologiaService.listar(queryParams);
      this.lote.siembra.crono = result.datos[0] as unknown as ICrono;
    }

    this.verSiembraActual();
  }

  ngOnDestroy(): void {}
}
