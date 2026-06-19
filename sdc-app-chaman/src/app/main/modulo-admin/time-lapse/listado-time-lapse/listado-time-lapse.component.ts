import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ICamara, IFoto, ILote, IQueryParam } from 'modelos/src';
import { CamaraService } from '../../../../auxiliares/http/camara.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-time-lapse',
  imports: [SharedModule],
  templateUrl: './listado-time-lapse.component.html',
  styleUrl: './listado-time-lapse.component.scss',
})
export class ListadoTimeLapseComponent implements OnInit {
  public loading = false;
  public loadingLotes = false;
  public loadingFotos = false;
  public guardandoAsignacion = false;
  public sincronizando = false;
  public capturandoSerial = '';

  public camaras: ICamara[] = [];
  public lotes: ILote[] = [];
  public fotos: IFoto[] = [];
  public busqueda = '';

  public camaraSeleccionada?: ICamara;
  public idsLoteSeleccionados: string[] = [];
  public visibleAsignar = false;
  public visibleFotos = false;
  public imagenVisible = false;
  public imagenActiva?: string;
  public indiceImagenActiva = 0;

  public readonly name = ListadoTimeLapseComponent.name;

  get camarasFiltradas(): ICamara[] {
    const term = this.busqueda.trim().toLowerCase();
    if (!term) {
      return this.camaras;
    }
    return this.camaras.filter((camara) =>
      [
        camara.nombre,
        camara.serialCamara,
        camara.modelo,
        camara.categoria,
        camara.area,
        ...(camara.lotes || []).map((lote) => lote.nombre),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }

  get lotesOptions() {
    return this.lotes.map((lote) => ({
      label: `${lote.nombre || 'Lote sin nombre'}${lote.establecimiento?.nombre ? ` - ${lote.establecimiento.nombre}` : ''}`,
      value: lote._id,
    }));
  }

  constructor(
    public helper: HelperService,
    private camaraService: CamaraService,
    private translate: TranslateService
  ) {}

  public async ngOnInit(): Promise<void> {
    await this.listar();
  }

  public async listar(): Promise<void> {
    this.loading = true;
    try {
      const data = await this.camaraService.listar();
      this.camaras = data.datos || [];
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  public async sincronizar(): Promise<void> {
    this.sincronizando = true;
    try {
      const data = await this.camaraService.sincronizar();
      this.camaras = data.datos || [];
      this.helper.notifSuccess(this.translate.instant('Inventario de camaras sincronizado'));
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.sincronizando = false;
    }
  }

  public async abrirAsignacion(camara: ICamara): Promise<void> {
    this.camaraSeleccionada = camara;
    this.idsLoteSeleccionados = (camara.lotes || []).map((lote) => lote._id).filter(Boolean) as string[];
    this.visibleAsignar = true;
    await this.cargarLotesDisponibles();
  }

  public async guardarAsignacion(): Promise<void> {
    if (!this.camaraSeleccionada?.serialCamara) return;
    this.guardandoAsignacion = true;
    try {
      await this.camaraService.asignarLotes(this.camaraSeleccionada.serialCamara, {
        idsLote: this.idsLoteSeleccionados,
        reemplazar: true,
      });
      this.helper.notifSuccess(this.translate.instant('Camara asignada correctamente'));
      this.visibleAsignar = false;
      await this.listar();
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.guardandoAsignacion = false;
    }
  }

  public async abrirFotos(camara: ICamara): Promise<void> {
    this.camaraSeleccionada = camara;
    this.visibleFotos = true;
    await this.cargarFotos(camara);
  }

  public async capturarAhora(camara: ICamara): Promise<void> {
    if (!camara.serialCamara) return;
    this.capturandoSerial = camara.serialCamara;
    try {
      await this.camaraService.capturar(camara.serialCamara, camara.canal || 1);
      this.helper.notifSuccess(this.translate.instant('Captura solicitada correctamente'));
      await this.listar();
      if (this.visibleFotos && this.camaraSeleccionada?.serialCamara === camara.serialCamara) {
        await this.cargarFotos(camara);
      }
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.capturandoSerial = '';
    }
  }

  public verFoto(foto: IFoto): void {
    this.indiceImagenActiva = this.fotos.findIndex((item) => item._id === foto._id);
    this.imagenActiva = foto.url;
    this.imagenVisible = true;
  }

  public siguienteFoto(): void {
    if (this.indiceImagenActiva >= this.fotos.length - 1) return;
    this.indiceImagenActiva++;
    this.imagenActiva = this.fotos[this.indiceImagenActiva]?.url;
  }

  public fotoAnterior(): void {
    if (this.indiceImagenActiva <= 0) return;
    this.indiceImagenActiva--;
    this.imagenActiva = this.fotos[this.indiceImagenActiva]?.url;
  }

  public trackCamara(_index: number, camara: ICamara): string {
    return camara.serialCamara;
  }

  public trackFoto(_index: number, foto: IFoto): string {
    return foto._id || foto.url || String(_index);
  }

  private async cargarLotesDisponibles(): Promise<void> {
    if (this.lotes.length) return;
    this.loadingLotes = true;
    try {
      const data = await this.camaraService.listarLotesDisponibles();
      this.lotes = data.datos || [];
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loadingLotes = false;
    }
  }

  private async cargarFotos(camara: ICamara): Promise<void> {
    this.loadingFotos = true;
    try {
      const params: IQueryParam = {
        limit: 50,
        sort: '-fechaCreacion',
      };
      const data = await this.camaraService.listarFotos(camara.serialCamara, params);
      this.fotos = data.datos || [];
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loadingFotos = false;
    }
  }
}
