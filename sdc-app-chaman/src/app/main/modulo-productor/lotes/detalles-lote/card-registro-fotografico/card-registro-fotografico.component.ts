import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { IFoto, ILote, IVisitaLote } from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { FotoService } from '../../../../../auxiliares/http/foto.service';
import { VisitaLoteService } from '../../../../../auxiliares/http/visita-lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';

interface ArchivoFotoCampo {
  file: File;
  preview: string;
}

@Component({
  selector: 'app-card-registro-fotografico',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './card-registro-fotografico.component.html',
  styleUrl: './card-registro-fotografico.component.scss',
})
export class CardRegistroFotograficoComponent implements OnChanges, OnDestroy {
  @Input() lote?: ILote;

  fotos: IFoto[] = [];
  visitas: IVisitaLote[] = [];
  cargando = false;
  subiendo = false;
  dialogoRegistro = false;
  dialogoGaleria = false;
  fotoSeleccionada?: IFoto;
  archivos: ArchivoFotoCampo[] = [];
  titulo = '';
  descripcion = '';
  etiquetas = '';
  idVisita = '';
  fechaCaptura = this.fechaInput(new Date());
  latitud?: number;
  longitud?: number;
  precisionMetros?: number;
  buscandoUbicacion = false;
  private imagenesAutenticadas = new Map<string, string>();
  private cicloCargaImagenes = 0;

  constructor(
    private fotosService: FotoService,
    private visitasService: VisitaLoteService,
    private confirmation: ConfirmationService,
    public helper: HelperService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote'] && this.lote?._id) void this.cargar();
  }

  ngOnDestroy(): void {
    this.cicloCargaImagenes += 1;
    this.liberarImagenesAutenticadas();
    this.liberarPreviews();
  }

  async cargar(): Promise<void> {
    if (!this.lote?._id) return;
    const ciclo = ++this.cicloCargaImagenes;
    this.liberarImagenesAutenticadas();
    this.fotos = [];
    this.cargando = true;
    try {
      const [fotos, visitas] = await Promise.all([
        this.fotosService.listarPorLote(this.lote._id),
        this.visitasService.listarPorLote(this.lote._id).catch(() => ({ datos: [], totalCount: 0 })),
      ]);
      if (ciclo !== this.cicloCargaImagenes) return;
      this.fotos = (fotos.datos || [])
        .filter((foto) => foto.fuente === 'campo' && !foto.archivado)
        .sort((a, b) => this.timestamp(b.fechaCaptura || b.fechaCreacion) - this.timestamp(a.fechaCaptura || a.fechaCreacion));
      this.visitas = (visitas.datos || []).filter((visita) => !visita.archivado);
      await Promise.all(this.fotos.map((foto) => this.cargarImagenAutenticada(foto, ciclo)));
    } catch (error) {
      if (ciclo === this.cicloCargaImagenes) this.helper.notifError(error);
    } finally {
      if (ciclo === this.cicloCargaImagenes) this.cargando = false;
    }
  }

  abrirRegistro(): void {
    this.limpiarFormulario();
    this.dialogoRegistro = true;
  }

  async seleccionarArchivos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const nuevos = Array.from(input.files || []).slice(0, Math.max(0, 8 - this.archivos.length));
    input.value = '';
    if (!nuevos.length) return;
    try {
      const normalizados = await Promise.all(nuevos.map((file) => this.normalizarImagen(file)));
      for (const file of normalizados) {
        this.archivos.push({ file, preview: URL.createObjectURL(file) });
      }
    } catch (error) {
      this.helper.notifError(error);
    }
  }

  quitarArchivo(index: number): void {
    const [quitado] = this.archivos.splice(index, 1);
    if (quitado?.preview) URL.revokeObjectURL(quitado.preview);
  }

  capturarUbicacion(): void {
    if (!navigator.geolocation) {
      this.helper.notifError('Este dispositivo no permite obtener ubicacion.');
      return;
    }
    this.buscandoUbicacion = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.latitud = position.coords.latitude;
        this.longitud = position.coords.longitude;
        this.precisionMetros = position.coords.accuracy;
        this.buscandoUbicacion = false;
      },
      () => {
        this.buscandoUbicacion = false;
        this.helper.notifError('No se pudo obtener la ubicacion. Puede continuar sin ella.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  quitarUbicacion(): void {
    this.latitud = undefined;
    this.longitud = undefined;
    this.precisionMetros = undefined;
  }

  async guardar(): Promise<void> {
    if (!this.lote?._id || !this.archivos.length || this.subiendo) return;
    this.subiendo = true;
    try {
      await this.fotosService.subirCampo(
        this.archivos.map((item) => item.file),
        {
          idLote: this.lote._id,
          idVisita: this.idVisita || undefined,
          fechaCaptura: new Date(`${this.fechaCaptura}T12:00:00`).toISOString(),
          titulo: this.titulo,
          descripcion: this.descripcion,
          etiquetas: this.etiquetas.split(',').map((x) => x.trim()).filter(Boolean),
          latitud: this.latitud,
          longitud: this.longitud,
          precisionMetros: this.precisionMetros,
        },
      );
      this.helper.notifSuccess(this.archivos.length === 1 ? 'Foto registrada' : 'Fotos registradas');
      this.dialogoRegistro = false;
      this.limpiarFormulario();
      await this.cargar();
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.subiendo = false;
    }
  }

  verFoto(foto: IFoto): void {
    this.fotoSeleccionada = foto;
    this.dialogoGaleria = true;
  }

  imagenDe(foto: IFoto): string {
    return foto._id ? this.imagenesAutenticadas.get(foto._id) || '' : '';
  }

  archivarFoto(foto: IFoto): void {
    if (!foto._id) return;
    this.confirmation.confirm({
      header: 'Archivar evidencia fotografica',
      message: 'La foto dejara de mostrarse en el lote, pero se conservara su trazabilidad.',
      icon: 'pi pi-archive',
      acceptLabel: 'Archivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        try {
          await this.fotosService.eliminar(foto._id!);
          this.retirarFotoLocal(foto);
          this.helper.notifSuccess('Foto archivada');
          this.dialogoGaleria = false;
          await this.cargar();
        } catch (error) {
          this.helper.notifError(error);
        }
      },
    });
  }

  etiquetaFecha(value?: string): string {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  }

  etiquetaVisita(id?: string): string {
    const visita = this.visitas.find((item) => item._id === id);
    return visita ? visita.titulo || 'Visita al lote' : '';
  }

  private limpiarFormulario(): void {
    this.liberarPreviews();
    this.archivos = [];
    this.titulo = '';
    this.descripcion = '';
    this.etiquetas = '';
    this.idVisita = '';
    this.fechaCaptura = this.fechaInput(new Date());
    this.quitarUbicacion();
  }

  private liberarPreviews(): void {
    this.archivos.forEach((item) => URL.revokeObjectURL(item.preview));
  }

  private async cargarImagenAutenticada(foto: IFoto, ciclo: number): Promise<void> {
    if (!foto._id) return;
    try {
      const response = await this.fotosService.getImagen(foto._id);
      if (
        ciclo !== this.cicloCargaImagenes ||
        !this.fotos.some((item) => item._id === foto._id)
      ) {
        return;
      }
      const blob = this.blobRenderizable(response, foto);
      const objectUrl = URL.createObjectURL(blob);
      if (
        ciclo !== this.cicloCargaImagenes ||
        !this.fotos.some((item) => item._id === foto._id)
      ) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      this.imagenesAutenticadas.set(foto._id, objectUrl);
    } catch {
      // La metadata sigue disponible, pero nunca se usa la URL de almacenamiento
      // como fallback: las fotos de campo solo se muestran por el proxy autenticado.
    }
  }

  private blobRenderizable(blob: Blob, foto: IFoto): Blob {
    if (blob.type.startsWith('image/')) return blob;
    const mime = /^image\/(jpeg|png|webp)$/i.test(String(foto.mimeType || ''))
      ? String(foto.mimeType)
      : /\.png(?:$|[?#])/i.test(String(foto.url || ''))
        ? 'image/png'
        : /\.webp(?:$|[?#])/i.test(String(foto.url || ''))
          ? 'image/webp'
          : 'image/jpeg';
    return blob.slice(0, blob.size, mime);
  }

  private retirarFotoLocal(foto: IFoto): void {
    if (foto._id) {
      const objectUrl = this.imagenesAutenticadas.get(foto._id);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      this.imagenesAutenticadas.delete(foto._id);
      this.fotos = this.fotos.filter((item) => item._id !== foto._id);
    }
    if (this.fotoSeleccionada?._id === foto._id) {
      this.fotoSeleccionada = undefined;
    }
  }

  private liberarImagenesAutenticadas(): void {
    this.imagenesAutenticadas.forEach((url) => URL.revokeObjectURL(url));
    this.imagenesAutenticadas.clear();
  }

  private fechaInput(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private timestamp(value?: string): number {
    return value ? new Date(value).getTime() || 0 : 0;
  }

  private async normalizarImagen(file: File): Promise<File> {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Solo se admiten imagenes JPG, PNG o WebP.');
    const imagen = await this.decodificarImagen(file);
    const maxSide = 2560;
    const scale = Math.min(1, maxSide / Math.max(imagen.width, imagen.height));
    if (scale === 1 && file.size <= 4 * 1024 * 1024) {
      imagen.dispose();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imagen.width * scale));
    canvas.height = Math.max(1, Math.round(imagen.height * scale));
    canvas.getContext('2d')?.drawImage(imagen.source, 0, 0, canvas.width, canvas.height);
    imagen.dispose();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('No se pudo preparar la foto.'))), 'image/jpeg', 0.86),
    );
    const base = file.name.replace(/\.[^.]+$/, '') || 'foto-campo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  }

  private async decodificarImagen(file: File): Promise<{
    source: CanvasImageSource;
    width: number;
    height: number;
    dispose: () => void;
  }> {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('No se pudo leer la foto seleccionada.'));
      });
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}
