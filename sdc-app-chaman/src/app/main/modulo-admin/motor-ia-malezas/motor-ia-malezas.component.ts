import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  IaMalezaAnalisis,
  IaMalezaDetection,
  IaMalezasService,
} from '../../../auxiliares/http/ia-malezas.service';
import { CamaraService } from '../../../auxiliares/http/camara.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../auxiliares/shared.module';
import { ICamara, IFoto } from 'modelos/src';

@Component({
  selector: 'app-motor-ia-malezas',
  imports: [SharedModule],
  templateUrl: './motor-ia-malezas.component.html',
  styleUrl: './motor-ia-malezas.component.scss',
})
export class MotorIaMalezasComponent implements OnInit, OnDestroy {
  public loading = false;
  public uploading = false;
  public analyzingId = '';
  public health: Record<string, any> = {};
  public analyses: IaMalezaAnalisis[] = [];
  public cameras: ICamara[] = [];
  public cameraPhotos: IFoto[] = [];
  public selected?: IaMalezaAnalisis;
  public selectedCamera?: ICamara;
  public selectedPhoto?: IFoto;
  public selectedFiles: File[] = [];

  public originalImageUrl = '';
  public processedImageUrl = '';
  public processedNatural = { width: 0, height: 0 };
  public loadingCameras = false;
  public loadingPhotos = false;
  public importingPhoto = false;

  public form = {
    ensayoId: '',
    loteId: '',
    loteNombre: '',
    cultivo: '',
    campania: '2025/2026',
    fecha: this.today(),
    tipoAnalisis: 'deteccion_malezas',
  };

  public filters = {
    campania: '',
    lote: '',
    cultivo: '',
    clase: '',
    fecha: '',
  };

  public readonly analysisTypes = [{ label: 'Deteccion de malezas', value: 'deteccion_malezas' }];
  public readonly weedClasses = ['cultivo', 'maleza_generica', 'suelo', 'amaranthus', 'rama_negra', 'eleusine'];

  constructor(
    private iaMalezasService: IaMalezasService,
    private camaraService: CamaraService,
    public helper: HelperService
  ) {}

  public async ngOnInit(): Promise<void> {
    await Promise.all([this.loadHealth(), this.loadAnalyses(), this.loadCameras()]);
  }

  public ngOnDestroy(): void {
    this.revokeImages();
  }

  get filteredAnalyses(): IaMalezaAnalisis[] {
    return this.analyses.filter((analysis) => {
      const loteText = `${analysis.loteNombre || ''} ${analysis.loteId || ''}`.toLowerCase();
      const classes = (analysis.detections || []).map((det) => det.class).join(' ').toLowerCase();
      return (
        (!this.filters.campania || (analysis.campania || '').toLowerCase().includes(this.filters.campania.toLowerCase())) &&
        (!this.filters.lote || loteText.includes(this.filters.lote.toLowerCase())) &&
        (!this.filters.cultivo || (analysis.cultivo || '').toLowerCase().includes(this.filters.cultivo.toLowerCase())) &&
        (!this.filters.clase || classes.includes(this.filters.clase.toLowerCase())) &&
        (!this.filters.fecha || analysis.fecha === this.filters.fecha)
      );
    });
  }

  get rawJson(): string {
    return JSON.stringify(this.selected?.resultJson || this.selected || {}, null, 2);
  }

  get selectedDetections(): IaMalezaDetection[] {
    return this.selected?.detections || [];
  }

  get selectedSummary(): Record<string, any> {
    return this.selected?.summary || {};
  }

  get mainDetection(): IaMalezaDetection | undefined {
    return [...this.selectedDetections]
      .filter((item) => !['cultivo', 'suelo'].includes(item.class))
      .sort((a, b) => b.confidence - a.confidence)[0];
  }

  public async loadHealth(): Promise<void> {
    try {
      this.health = await this.iaMalezasService.health();
    } catch (error) {
      this.health = { status: 'error', detail: 'No se pudo consultar el motor IA' };
    }
  }

  public async loadAnalyses(): Promise<void> {
    this.loading = true;
    try {
      const data = await this.iaMalezasService.listar({ sort: '-createdAt', limit: 100 });
      this.analyses = data.datos || [];
      if (!this.selected && this.analyses.length) {
        await this.selectAnalysis(this.analyses[0]);
      } else if (this.selected?._id) {
        const refreshed = this.analyses.find((item) => item._id === this.selected?._id);
        if (refreshed) await this.selectAnalysis(refreshed);
      }
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  public async loadCameras(): Promise<void> {
    this.loadingCameras = true;
    try {
      const data = await this.camaraService.listar({ limit: 0, sort: 'nombre' });
      this.cameras = data.datos || [];
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loadingCameras = false;
    }
  }

  public async selectCamera(serial?: string): Promise<void> {
    this.selectedCamera = this.cameras.find((item) => item.serialCamara === serial);
    this.selectedPhoto = undefined;
    this.cameraPhotos = [];
    if (!this.selectedCamera?.serialCamara) return;
    this.loadingPhotos = true;
    try {
      const data = await this.camaraService.listarFotos(this.selectedCamera.serialCamara, {
        limit: 24,
        sort: '-fechaCreacion',
      });
      this.cameraPhotos = data.datos || [];
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loadingPhotos = false;
    }
  }

  public selectPhoto(photo: IFoto): void {
    this.selectedPhoto = photo;
    const lote = this.selectedCamera?.lotes?.find((item) => item._id === photo.idLote) || this.selectedCamera?.lotes?.[0];
    this.form.loteId = photo.idLote || lote?._id || this.form.loteId;
    this.form.loteNombre = lote?.nombre || this.form.loteNombre;
    this.form.fecha = photo.fechaCreacion ? new Date(photo.fechaCreacion).toISOString().slice(0, 10) : this.form.fecha;
  }

  public async importSelectedPhoto(): Promise<void> {
    if (!this.selectedPhoto?._id) {
      this.helper.notifError('Seleccione una imagen de camara');
      return;
    }
    this.importingPhoto = true;
    try {
      const imported = await this.iaMalezasService.importarFoto({
        ...this.form,
        fotoId: this.selectedPhoto._id,
      });
      this.helper.notifSuccess('Imagen de camara importada al motor IA');
      await this.loadAnalyses();
      await this.selectAnalysis(imported);
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.importingPhoto = false;
    }
  }

  public onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFiles = Array.from(input.files || []);
  }

  public async upload(): Promise<void> {
    if (!this.selectedFiles.length) {
      this.helper.notifError('Seleccione una o varias imagenes');
      return;
    }
    this.uploading = true;
    try {
      const uploaded = await this.iaMalezasService.subir(this.selectedFiles, this.form);
      this.helper.notifSuccess(`${uploaded.length} imagen(es) cargadas`);
      this.selectedFiles = [];
      await this.loadAnalyses();
      if (uploaded[0]) await this.selectAnalysis(uploaded[0]);
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.uploading = false;
    }
  }

  public async analyze(analysis?: IaMalezaAnalisis): Promise<void> {
    const item = analysis || this.selected;
    if (!item?._id) return;
    this.analyzingId = item._id;
    try {
      const updated = await this.iaMalezasService.analizar(item._id);
      this.helper.notifSuccess('Analisis finalizado');
      await this.loadAnalyses();
      await this.selectAnalysis(updated);
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.analyzingId = '';
    }
  }

  public async selectAnalysis(analysis: IaMalezaAnalisis): Promise<void> {
    this.selected = analysis;
    await this.loadImages(analysis);
  }

  public statusClass(estado?: string): string {
    return `status-${estado || 'pendiente'}`;
  }

  public confidence(value?: number): string {
    return `${Math.round((value || 0) * 100)}%`;
  }

  public severityClass(det?: IaMalezaDetection): string {
    return `severity-${det?.severity || 'medio'}`;
  }

  public bboxStyle(det: IaMalezaDetection): Record<string, string> {
    const width = this.processedNatural.width || 1;
    const height = this.processedNatural.height || 1;
    const x = Math.max(0, (det.bbox.x1 / width) * 100);
    const y = Math.max(0, (det.bbox.y1 / height) * 100);
    const w = Math.max(1, ((det.bbox.x2 - det.bbox.x1) / width) * 100);
    const h = Math.max(1, ((det.bbox.y2 - det.bbox.y1) / height) * 100);
    return {
      left: `${x}%`,
      top: `${y}%`,
      width: `${Math.min(w, 100 - x)}%`,
      height: `${Math.min(h, 100 - y)}%`,
    };
  }

  public onProcessedImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.processedNatural = {
      width: img.naturalWidth || 0,
      height: img.naturalHeight || 0,
    };
  }

  public totalDetections(item?: IaMalezaAnalisis): number {
    return item?.summary?.['total_detections'] || item?.detections?.length || 0;
  }

  public maxConfidence(item?: IaMalezaAnalisis): string {
    return this.confidence(item?.summary?.['max_confidence']);
  }

  private async loadImages(analysis: IaMalezaAnalisis): Promise<void> {
    this.revokeImages();
    if (!analysis._id) return;
    try {
      const original = await this.iaMalezasService.imagen(analysis._id, 'original');
      this.originalImageUrl = URL.createObjectURL(original);
      if (analysis.estado === 'completado') {
        const processed = await this.iaMalezasService.imagen(analysis._id, 'procesada');
        this.processedImageUrl = URL.createObjectURL(processed);
      }
    } catch (error) {
      this.helper.notifError(error);
    }
  }

  private revokeImages(): void {
    if (this.originalImageUrl) URL.revokeObjectURL(this.originalImageUrl);
    if (this.processedImageUrl) URL.revokeObjectURL(this.processedImageUrl);
    this.originalImageUrl = '';
    this.processedImageUrl = '';
    this.processedNatural = { width: 0, height: 0 };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
