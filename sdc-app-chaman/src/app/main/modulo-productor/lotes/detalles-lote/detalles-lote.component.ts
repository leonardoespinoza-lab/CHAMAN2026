import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ICrono, IFertilizacion, IFumigacion, IQueryParam, ISiembra } from 'modelos/src';
import { FenologiaService } from '../../../../auxiliares/http/fenologia.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';
import { CardClimaLoteComponent } from './card-clima-lote/card-clima-lote.component';
import { CardDispositivosComponent } from './card-dispositivos/card-dispositivos.component';
import { CardEnfermedadesComponent } from './card-enfermedades/card-enfermedades.component';
import { CardEtapaFenologicaComponent } from './card-etapa-fenologica/card-etapa-fenologica.component';
import { CardEtapasFenologicasComponent } from './card-etapas-fenologicas/card-etapas-fenologicas.component';
import { CardHuellaHidricaComponent } from './card-huella-hidrica/card-huella-hidrica.component';
import { CardNDVIComponent } from './card-ndvi/card-ndvi.component';
import { CardRendimientoComponent } from './card-rendimiento/card-rendimiento.component';
import { CardRiegoComponent } from './card-riego/card-riego.component';
import { CardUltimaFertilizacionComponent } from './card-ultima-fertilizacion/card-ultima-fertilizacion.component';
import { CardUltimaFumigacionComponent } from './card-ultima-fumigacion/card-ultima-fumigacion.component';
import { DrawerListadoSiembrasComponent } from './drawer-listado-siembras/drawer-listado-siembras.component';

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

  constructor(
    private paramsService: ParamsService,
    public helper: HelperService,
    public params: ParamsService,
    private router: Router,
    private fenologiaService: FenologiaService,
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
    this.router.navigate(['lotes', 'sembrar', data?._id]);
  }

  async ngOnInit(): Promise<void> {
    this.lote = this.paramsService.get('detallesLote');

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
