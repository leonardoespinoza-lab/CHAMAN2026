import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ICamara, IFoto, ILote, IQueryParam, IUpdateCamara } from 'modelos/src';
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
  public guardandoProgramacion = false;
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
  public visibleProgramacion = false;
  public imagenVisible = false;
  public imagenActiva?: string;
  public indiceImagenActiva = 0;
  public fotoSeleccionada?: IFoto;
  public zoomImagen = 1;
  public programacion: NonNullable<IUpdateCamara['capturaAutomatica']> = {
    habilitada: false,
    intervaloMinutos: 1440,
    reintentoMinutos: 10,
    horaInicio: '08:00',
    horaFin: '18:00',
  };

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

  public abrirProgramacion(camara: ICamara): void {
    this.camaraSeleccionada = camara;
    const captura = camara.capturaAutomatica || {};
    this.programacion = {
      habilitada: Boolean(captura.habilitada),
      intervaloMinutos: captura.intervaloMinutos || 1440,
      reintentoMinutos: captura.reintentoMinutos || 10,
      horaInicio: captura.horaInicio || '08:00',
      horaFin: captura.horaFin || '18:00',
      proximoIntento: captura.proximoIntento,
      ultimoIntento: captura.ultimoIntento,
      ultimoExito: captura.ultimoExito,
      ultimoError: captura.ultimoError,
      estado: captura.estado,
    };
    this.visibleProgramacion = true;
  }

  public async guardarProgramacion(): Promise<void> {
    if (!this.camaraSeleccionada?.serialCamara) return;
    this.guardandoProgramacion = true;
    try {
      await this.camaraService.actualizar(this.camaraSeleccionada.serialCamara, {
        capturaAutomatica: {
          ...this.programacion,
          intervaloMinutos: Number(this.programacion.intervaloMinutos || 1440),
          reintentoMinutos: Number(this.programacion.reintentoMinutos || 10),
        },
      });
      this.helper.notifSuccess(this.translate.instant('Programacion de camara guardada'));
      this.visibleProgramacion = false;
      await this.listar();
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.guardandoProgramacion = false;
    }
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
    this.fotoSeleccionada = undefined;
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

  public seleccionarFoto(foto: IFoto): void {
    this.fotoSeleccionada = foto;
    this.indiceImagenActiva = Math.max(
      0,
      this.fotos.findIndex((item) => (foto._id ? item._id === foto._id : item.url === foto.url))
    );
  }

  public verFoto(foto?: IFoto): void {
    const fotoActual = foto || this.fotoSeleccionada;
    if (!fotoActual?.url) return;
    this.fotoSeleccionada = fotoActual;
    this.indiceImagenActiva = Math.max(
      0,
      this.fotos.findIndex((item) =>
        fotoActual._id ? item._id === fotoActual._id : item.url === fotoActual.url
      )
    );
    this.imagenActiva = fotoActual.url;
    this.zoomImagen = 1;
    this.imagenVisible = true;
  }

  public siguienteFoto(): void {
    if (this.indiceImagenActiva >= this.fotos.length - 1) return;
    this.indiceImagenActiva++;
    this.fotoSeleccionada = this.fotos[this.indiceImagenActiva];
    this.imagenActiva = this.fotoSeleccionada?.url;
    this.zoomImagen = 1;
  }

  public fotoAnterior(): void {
    if (this.indiceImagenActiva <= 0) return;
    this.indiceImagenActiva--;
    this.fotoSeleccionada = this.fotos[this.indiceImagenActiva];
    this.imagenActiva = this.fotoSeleccionada?.url;
    this.zoomImagen = 1;
  }

  public aumentarZoom(): void {
    this.zoomImagen = Math.min(3, Number((this.zoomImagen + 0.2).toFixed(1)));
  }

  public disminuirZoom(): void {
    this.zoomImagen = Math.max(0.6, Number((this.zoomImagen - 0.2).toFixed(1)));
  }

  public resetZoom(): void {
    this.zoomImagen = 1;
  }

  public descargarImagenActual(): void {
    const url = this.imagenActiva || this.fotoSeleccionada?.url;
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.download = `${this.camaraSeleccionada?.serialCamara || 'camara'}-${this.fotoSeleccionada?.fechaCreacion || 'imagen'}.jpg`;
    link.click();
  }

  public estadoProgramacion(camara: ICamara): string {
    const captura = camara.capturaAutomatica;
    if (!captura?.habilitada) {
      return 'Manual';
    }
    if (captura.estado === 'ok' && captura.ultimoExito) {
      return `Ultima captura ${new Date(captura.ultimoExito).toLocaleString()}`;
    }
    if (captura.estado === 'error') {
      return `Reintentando cada ${captura.reintentoMinutos || 10} min`;
    }
    if (captura.estado === 'fuera_de_ventana') {
      return `Fuera de ventana ${captura.horaInicio || '08:00'}-${captura.horaFin || '18:00'}`;
    }
    return `Programada cada ${captura.intervaloMinutos || 1440} min`;
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
      this.fotoSeleccionada = this.fotos[0];
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loadingFotos = false;
    }
  }
}
