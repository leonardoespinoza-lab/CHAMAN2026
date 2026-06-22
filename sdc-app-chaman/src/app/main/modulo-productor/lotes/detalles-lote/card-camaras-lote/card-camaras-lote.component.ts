import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { IFoto, ILote } from 'modelos/src';
import { FotoService } from '../../../../../auxiliares/http/foto.service';
import { SharedModule } from '../../../../../auxiliares/shared.module';

@Component({
  selector: 'app-card-camaras-lote',
  imports: [CommonModule, SharedModule],
  templateUrl: './card-camaras-lote.component.html',
  styleUrl: './card-camaras-lote.component.scss',
})
export class CardCamarasLoteComponent implements OnChanges {
  @Input() public lote?: ILote;

  public loading = false;
  public fotos: IFoto[] = [];
  public visible = false;
  public repositorioVisible = false;
  public imagenActiva?: string;
  public fotoSeleccionada?: IFoto;
  public zoomImagen = 1;

  constructor(private fotoService: FotoService) {}

  public get ultimaFoto(): IFoto | undefined {
    return this.fotos[0];
  }

  public get fotosVisibles(): IFoto[] {
    return this.fotos.slice(0, 7);
  }

  public async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['lote']) {
      await this.cargarFotos();
    }
  }

  public seleccionarFoto(foto: IFoto): void {
    this.fotoSeleccionada = foto;
  }

  public abrir(foto?: IFoto): void {
    const fotoActual = foto || this.fotoSeleccionada;
    if (!fotoActual?.url) return;
    this.fotoSeleccionada = fotoActual;
    this.imagenActiva = fotoActual.url;
    this.zoomImagen = 1;
    this.visible = true;
  }

  public abrirRepositorio(): void {
    this.repositorioVisible = true;
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
    link.download = `${this.lote?.nombre || 'lote'}-${this.fotoSeleccionada?.fechaCreacion || 'imagen'}.jpg`;
    link.click();
  }

  private async cargarFotos(): Promise<void> {
    if (!this.lote?._id || !this.lote.serialCamara) {
      this.fotos = [];
      this.fotoSeleccionada = undefined;
      return;
    }

    this.loading = true;
    try {
      const response = await this.fotoService.listarPorLote(this.lote._id);
      this.fotos = (response.datos || [])
        .filter((foto) => foto.url)
        .sort(
          (a, b) =>
            new Date(b.fechaCreacion || 0).getTime() - new Date(a.fechaCreacion || 0).getTime()
        )
        .slice(0, 40);
      this.fotoSeleccionada = this.fotos[0];
    } finally {
      this.loading = false;
    }
  }
}
