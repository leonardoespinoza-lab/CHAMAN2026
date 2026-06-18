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
  public imagenActiva?: string;

  constructor(private fotoService: FotoService) {}

  public get ultimaFoto(): IFoto | undefined {
    return this.fotos[0];
  }

  public async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['lote']) {
      await this.cargarFotos();
    }
  }

  public abrir(foto?: IFoto): void {
    if (!foto?.url) return;
    this.imagenActiva = foto.url;
    this.visible = true;
  }

  private async cargarFotos(): Promise<void> {
    if (!this.lote?._id || !this.lote.serialCamara) {
      this.fotos = [];
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
        .slice(0, 6);
    } finally {
      this.loading = false;
    }
  }
}
