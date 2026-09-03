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

interface ArchivoAudioCampo {
  file: File;
  preview: string;
  duracionSegundos?: number;
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
  audios: IFoto[] = [];
  visitas: IVisitaLote[] = [];
  cargando = false;
  subiendo = false;
  dialogoRegistro = false;
  dialogoGaleria = false;
  dialogoAudio = false;
  dialogoAudios = false;
  fotoSeleccionada?: IFoto;
  audioSeleccionado?: IFoto;
  archivos: ArchivoFotoCampo[] = [];
  archivoAudio?: ArchivoAudioCampo;
  grabando = false;
  segundosGrabados = 0;
  titulo = '';
  descripcion = '';
  etiquetas = '';
  idVisita = '';
  fechaCaptura = this.fechaInput(new Date());
  latitud?: number;
  longitud?: number;
  precisionMetros?: number;
  buscandoUbicacion = false;
  guardandoVinculoId?: string;
  private imagenesAutenticadas = new Map<string, string>();
  private audiosAutenticados = new Map<string, string>();
  private cicloCargaImagenes = 0;
  private mediaRecorder?: MediaRecorder;
  private mediaStream?: MediaStream;
  private fragmentosAudio: Blob[] = [];
  private grabacionInterval?: ReturnType<typeof setInterval>;

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
    this.liberarAudiosAutenticados();
    this.limpiarAudio();
    this.detenerFlujoGrabacion();
  }

  async cargar(): Promise<void> {
    if (!this.lote?._id) return;
    const ciclo = ++this.cicloCargaImagenes;
    this.liberarImagenesAutenticadas();
    this.liberarAudiosAutenticados();
    this.fotos = [];
    this.audios = [];
    this.cargando = true;
    try {
      const [fotos, visitas] = await Promise.all([
        this.fotosService.listarPorLote(this.lote._id),
        this.visitasService.listarPorLote(this.lote._id).catch(() => ({ datos: [], totalCount: 0 })),
      ]);
      if (ciclo !== this.cicloCargaImagenes) return;
      const registros = (fotos.datos || [])
        .filter((foto) => foto.fuente === 'campo' && !foto.archivado)
        .sort((a, b) => this.timestamp(b.fechaCaptura || b.fechaCreacion) - this.timestamp(a.fechaCaptura || a.fechaCreacion));
      this.fotos = registros.filter((foto) => foto.tipoMedio !== 'audio');
      this.audios = registros.filter((foto) => foto.tipoMedio === 'audio');
      this.visitas = (visitas.datos || []).filter((visita) => !visita.archivado);
      await Promise.all([
        ...this.fotos.map((foto) => this.cargarImagenAutenticada(foto, ciclo)),
        ...this.audios.map((audio) => this.cargarAudioAutenticado(audio, ciclo)),
      ]);
    } catch (error) {
      if (ciclo === this.cicloCargaImagenes) this.helper.notifError(error);
    } finally {
      if (ciclo === this.cicloCargaImagenes) this.cargando = false;
    }
  }

  abrirRegistro(): void {
    this.limpiarFormulario();
    this.dialogoRegistro = true;
    void this.refrescarVisitas();
  }

  abrirRegistroAudio(): void {
    this.limpiarFormulario();
    this.limpiarAudio();
    this.dialogoAudio = true;
    void this.refrescarVisitas();
  }

  async seleccionarAudio(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await this.prepararAudio(file);
    } catch (error) {
      this.helper.notifError(error);
    }
  }

  async iniciarGrabacion(): Promise<void> {
    if (this.grabando) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.helper.notifError('Este navegador no permite grabar audio. Puede seleccionar un archivo.');
      return;
    }
    try {
      this.limpiarAudio();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.mimeGrabacionSoportado();
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);
      this.fragmentosAudio = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) this.fragmentosAudio.push(event.data);
      };
      this.mediaRecorder.onstop = () => void this.finalizarGrabacion();
      this.mediaRecorder.start(500);
      this.grabando = true;
      this.segundosGrabados = 0;
      this.grabacionInterval = setInterval(() => {
        this.segundosGrabados += 1;
        if (this.segundosGrabados >= 900) this.detenerGrabacion();
      }, 1000);
    } catch {
      this.detenerFlujoGrabacion();
      this.helper.notifError('No se pudo acceder al microfono. Revise el permiso del navegador.');
    }
  }

  detenerGrabacion(): void {
    if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
  }

  cerrarRegistroAudio(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.detenerFlujoGrabacion();
    this.limpiarAudio();
    this.dialogoAudio = false;
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

  async guardarAudio(): Promise<void> {
    if (!this.lote?._id || !this.archivoAudio || this.subiendo) return;
    this.subiendo = true;
    try {
      await this.fotosService.subirAudio(this.archivoAudio.file, {
        idLote: this.lote._id,
        idVisita: this.idVisita || undefined,
        fechaCaptura: new Date(`${this.fechaCaptura}T12:00:00`).toISOString(),
        duracionSegundos: this.archivoAudio.duracionSegundos,
        titulo: this.titulo,
        descripcion: this.descripcion,
        etiquetas: this.etiquetas.split(',').map((x) => x.trim()).filter(Boolean),
        latitud: this.latitud,
        longitud: this.longitud,
        precisionMetros: this.precisionMetros,
      });
      this.helper.notifSuccess('Audio registrado');
      this.dialogoAudio = false;
      this.limpiarFormulario();
      this.limpiarAudio();
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

  audioDe(audio: IFoto): string {
    return audio._id ? this.audiosAutenticados.get(audio._id) || '' : '';
  }

  verAudios(audio?: IFoto): void {
    this.audioSeleccionado = audio || this.audios[0];
    this.dialogoAudios = true;
    void this.refrescarVisitas();
  }

  async guardarVinculoVisita(audio: IFoto): Promise<void> {
    if (!audio._id || !audio.idVisita || this.guardandoVinculoId) return;
    this.guardandoVinculoId = audio._id;
    try {
      await this.fotosService.actualizar(audio._id, { idVisita: audio.idVisita });
      this.helper.notifSuccess('Audio vinculado a la visita');
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.guardandoVinculoId = undefined;
    }
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

  archivarAudio(audio: IFoto): void {
    if (!audio._id) return;
    this.confirmation.confirm({
      header: 'Archivar audio de campo',
      message: 'El audio dejara de mostrarse, pero se conservara su trazabilidad.',
      icon: 'pi pi-archive',
      acceptLabel: 'Archivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        try {
          await this.fotosService.eliminar(audio._id!);
          const url = this.audiosAutenticados.get(audio._id!);
          if (url) URL.revokeObjectURL(url);
          this.audiosAutenticados.delete(audio._id!);
          this.audios = this.audios.filter((item) => item._id !== audio._id);
          this.audioSeleccionado = this.audios[0];
          this.helper.notifSuccess('Audio archivado');
        } catch (error) {
          this.helper.notifError(error);
        }
      },
    });
  }

  duracionAudio(value?: number): string {
    const total = Math.max(0, Math.round(Number(value || 0)));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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

  private async refrescarVisitas(): Promise<void> {
    if (!this.lote?._id) return;
    try {
      const response = await this.visitasService.listarPorLote(this.lote._id);
      this.visitas = (response.datos || []).filter((visita) => !visita.archivado);
    } catch {
      // El registro de fotos y audios sigue disponible aunque Visitas este deshabilitado.
    }
  }

  private async prepararAudio(file: File): Promise<void> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mimePorExtension: Record<string, string> = {
      webm: 'audio/webm',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
      wav: 'audio/wav',
    };
    const mime = String(file.type || mimePorExtension[extension || ''] || '').split(';', 1)[0];
    if (!/^audio\/(webm|ogg|mpeg|mp3|mp4|m4a|x-m4a|wav|wave|x-wav)$/i.test(mime)) {
      throw new Error('Formato de audio no admitido. Use WebM, OGG, MP3, M4A o WAV.');
    }
    if (!file.size || file.size > 25 * 1024 * 1024) {
      throw new Error('El audio debe pesar menos de 25 MB.');
    }
    if (this.archivoAudio?.preview) URL.revokeObjectURL(this.archivoAudio.preview);
    const normalizado = file.type
      ? file
      : new File([file], file.name, { type: mime, lastModified: file.lastModified });
    const preview = URL.createObjectURL(normalizado);
    this.archivoAudio = {
      file: normalizado,
      preview,
      duracionSegundos: await this.leerDuracionAudio(preview),
    };
  }

  private leerDuracionAudio(url: string): Promise<number | undefined> {
    return new Promise((resolve) => {
      const media = new Audio();
      const finalizar = () => {
        const duracion = Number(media.duration);
        media.src = '';
        resolve(Number.isFinite(duracion) ? Math.round(duracion) : undefined);
      };
      media.preload = 'metadata';
      media.onloadedmetadata = finalizar;
      media.onerror = () => resolve(undefined);
      media.src = url;
    });
  }

  private mimeGrabacionSoportado(): string | undefined {
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
      .find((type) => MediaRecorder.isTypeSupported(type));
  }

  private async finalizarGrabacion(): Promise<void> {
    const type = this.mediaRecorder?.mimeType || this.fragmentosAudio[0]?.type || 'audio/webm';
    const blob = new Blob(this.fragmentosAudio, { type });
    const extension = /mp4/i.test(type) ? 'm4a' : /ogg/i.test(type) ? 'ogg' : 'webm';
    const file = new File([blob], `audio-campo-${Date.now()}.${extension}`, {
      type: type.split(';', 1)[0],
      lastModified: Date.now(),
    });
    const duracion = this.segundosGrabados;
    this.detenerFlujoGrabacion();
    try {
      await this.prepararAudio(file);
      if (this.archivoAudio && !this.archivoAudio.duracionSegundos) {
        this.archivoAudio.duracionSegundos = duracion;
      }
    } catch (error) {
      this.helper.notifError(error);
    }
  }

  private detenerFlujoGrabacion(): void {
    if (this.grabacionInterval) clearInterval(this.grabacionInterval);
    this.grabacionInterval = undefined;
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = undefined;
    this.mediaRecorder = undefined;
    this.fragmentosAudio = [];
    this.grabando = false;
  }

  public limpiarAudio(): void {
    if (this.archivoAudio?.preview) URL.revokeObjectURL(this.archivoAudio.preview);
    this.archivoAudio = undefined;
    this.segundosGrabados = 0;
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

  private async cargarAudioAutenticado(audio: IFoto, ciclo: number): Promise<void> {
    if (!audio._id) return;
    try {
      const blob = await this.fotosService.getAudio(audio._id);
      if (ciclo !== this.cicloCargaImagenes || !this.audios.some((item) => item._id === audio._id)) return;
      const mime = /^audio\//i.test(blob.type) ? blob.type : String(audio.mimeType || 'audio/webm');
      const objectUrl = URL.createObjectURL(blob.slice(0, blob.size, mime));
      if (ciclo !== this.cicloCargaImagenes || !this.audios.some((item) => item._id === audio._id)) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      this.audiosAutenticados.set(audio._id, objectUrl);
    } catch {
      // La metadata permanece visible aunque el archivo no pueda recuperarse.
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

  private liberarAudiosAutenticados(): void {
    this.audiosAutenticados.forEach((url) => URL.revokeObjectURL(url));
    this.audiosAutenticados.clear();
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
