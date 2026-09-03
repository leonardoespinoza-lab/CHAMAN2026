import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import {
  ICreateVisitaLote,
  IFoto,
  ILote,
  TActividadVisitaLote,
  TEstadoVisitaLote,
  TTipoVisitaLote,
  IVisitaLote,
} from 'modelos/src';
import { ConfirmationService } from 'primeng/api';
import { FotoService } from '../../../../../auxiliares/http/foto.service';
import { VisitaLoteService } from '../../../../../auxiliares/http/visita-lote.service';
import { HelperService } from '../../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../../auxiliares/shared.module';

interface DiaCalendarioVisitas {
  key: string;
  numero: number;
  actual: boolean;
  hoy: boolean;
  visitas: IVisitaLote[];
}

@Component({
  selector: 'app-card-visitas-lote',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './card-visitas-lote.component.html',
  styleUrl: './card-visitas-lote.component.scss',
})
export class CardVisitasLoteComponent implements OnChanges, OnDestroy {
  @Input() lote?: ILote;

  visitas: IVisitaLote[] = [];
  evidencias: IFoto[] = [];
  cargando = false;
  guardando = false;
  dialogo = false;
  editando?: IVisitaLote;
  mesVisible = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  titulo = 'Recorrida de lote';
  fechaVisita = this.fechaInput(new Date());
  horaInicio = '';
  horaFin = '';
  tipo: TTipoVisitaLote = 'recorrida_general';
  estado: TEstadoVisitaLote = 'realizada';
  actividades: TActividadVisitaLote[] = [];
  participantes = '';
  observaciones = '';
  hallazgos = '';
  recomendaciones = '';
  proximaVisita = '';
  latitud?: number;
  longitud?: number;
  precisionMetros?: number;
  buscandoUbicacion = false;
  mostrarHistorialCompleto = false;
  private audiosAutenticados = new Map<string, string>();
  private cicloCargaAudios = 0;

  readonly tipos: { value: TTipoVisitaLote; label: string }[] = [
    { value: 'recorrida_general', label: 'Recorrida general' },
    { value: 'monitoreo_sanitario', label: 'Monitoreo sanitario' },
    { value: 'fenologia', label: 'Fenologia' },
    { value: 'riego', label: 'Riego' },
    { value: 'nutricion', label: 'Nutricion' },
    { value: 'aplicacion', label: 'Aplicacion' },
    { value: 'muestreo', label: 'Muestreo' },
    { value: 'cosecha', label: 'Cosecha' },
    { value: 'otro', label: 'Otra visita' },
  ];
  readonly actividadesDisponibles: { value: TActividadVisitaLote; label: string; icon: string }[] = [
    { value: 'fotografias', label: 'Fotografias', icon: 'pi-camera' },
    { value: 'fenologia', label: 'Fenologia', icon: 'pi-calendar' },
    { value: 'enfermedades', label: 'Enfermedades', icon: 'pi-shield' },
    { value: 'malezas', label: 'Malezas', icon: 'pi-sun' },
    { value: 'plagas', label: 'Plagas', icon: 'pi-eye' },
    { value: 'riego', label: 'Riego', icon: 'pi-cloud' },
    { value: 'suelo', label: 'Suelo', icon: 'pi-map' },
    { value: 'nutricion', label: 'Nutricion', icon: 'pi-chart-bar' },
    { value: 'aplicaciones', label: 'Aplicaciones', icon: 'pi-send' },
    { value: 'rendimiento', label: 'Rendimiento', icon: 'pi-chart-line' },
  ];

  constructor(
    private visitasService: VisitaLoteService,
    private fotosService: FotoService,
    private confirmation: ConfirmationService,
    public helper: HelperService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lote'] && this.lote?._id) void this.cargar();
  }

  ngOnDestroy(): void {
    this.cicloCargaAudios += 1;
    this.liberarAudiosAutenticados();
  }

  get diasCalendario(): DiaCalendarioVisitas[] {
    const first = new Date(this.mesVisible.getFullYear(), this.mesVisible.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    const hoy = this.fechaInput(new Date());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = this.fechaInput(date);
      return {
        key,
        numero: date.getDate(),
        actual: date.getMonth() === this.mesVisible.getMonth(),
        hoy: key === hoy,
        visitas: this.visitas.filter((visita) => this.fechaInput(new Date(visita.fechaVisita || '')) === key),
      };
    });
  }

  get mesLabel(): string {
    const value = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(this.mesVisible);
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  get proximaVisitaResumen(): IVisitaLote | undefined {
    const hoy = new Date(this.fechaInput(new Date())).getTime();
    return this.visitas
      .filter((visita) => visita.estado === 'programada' && this.timestamp(visita.fechaVisita) >= hoy)
      .sort((a, b) => this.timestamp(a.fechaVisita) - this.timestamp(b.fechaVisita))[0];
  }

  get ultimaVisita(): IVisitaLote | undefined {
    return this.visitas
      .filter((visita) => visita.estado === 'realizada')
      .sort((a, b) => this.timestamp(b.fechaVisita) - this.timestamp(a.fechaVisita))[0];
  }

  get visitasOrdenadas(): IVisitaLote[] {
    return [...this.visitas].sort(
      (a, b) => this.timestamp(b.fechaVisita) - this.timestamp(a.fechaVisita),
    );
  }

  get visitasVisibles(): IVisitaLote[] {
    return this.mostrarHistorialCompleto
      ? this.visitasOrdenadas
      : this.visitasOrdenadas.slice(0, 4);
  }

  async cargar(): Promise<void> {
    if (!this.lote?._id) return;
    this.cargando = true;
    try {
      const [visitas, evidencias] = await Promise.all([
        this.visitasService.listarPorLote(this.lote._id),
        this.fotosService
          .listarPorLote(this.lote._id)
          .catch(() => ({ datos: [], totalCount: 0 })),
      ]);
      this.visitas = (visitas.datos || []).filter((visita) => !visita.archivado);
      this.evidencias = (evidencias.datos || []).filter(
        (evidencia) =>
          evidencia.fuente === 'campo' &&
          !evidencia.archivado &&
          !!evidencia.idVisita,
      );
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.cargando = false;
    }
  }

  cambiarMes(delta: number): void {
    this.mesVisible = new Date(this.mesVisible.getFullYear(), this.mesVisible.getMonth() + delta, 1);
  }

  abrirNueva(fecha = this.fechaInput(new Date())): void {
    this.cicloCargaAudios += 1;
    this.liberarAudiosAutenticados();
    this.limpiarFormulario();
    this.fechaVisita = fecha;
    this.dialogo = true;
  }

  seleccionarDia(dia: DiaCalendarioVisitas): void {
    if (dia.visitas.length) this.abrirVisita(dia.visitas[0]);
    else if (!this.helper.soloLectura()) this.abrirNueva(dia.key);
  }

  abrirVisita(visita: IVisitaLote): void {
    const ciclo = ++this.cicloCargaAudios;
    this.liberarAudiosAutenticados();
    this.editando = visita;
    this.titulo = visita.titulo || 'Visita al lote';
    this.fechaVisita = this.fechaInput(new Date(visita.fechaVisita || Date.now()));
    this.horaInicio = visita.horaInicio || '';
    this.horaFin = visita.horaFin || '';
    this.tipo = visita.tipo || 'recorrida_general';
    this.estado = visita.estado || 'realizada';
    this.actividades = [...(visita.actividades || [])];
    this.participantes = (visita.participantes || []).join(', ');
    this.observaciones = visita.observaciones || '';
    this.hallazgos = visita.hallazgos || '';
    this.recomendaciones = visita.recomendaciones || '';
    this.proximaVisita = visita.proximaVisita ? this.fechaInput(new Date(visita.proximaVisita)) : '';
    this.latitud = visita.latitud;
    this.longitud = visita.longitud;
    this.precisionMetros = visita.precisionMetros;
    this.dialogo = true;
    void this.refrescarEvidenciasVisita(visita, ciclo);
  }

  resumenVisita(visita: IVisitaLote): string {
    return (
      visita.observaciones ||
      visita.hallazgos ||
      visita.recomendaciones ||
      'Sin comentarios registrados.'
    );
  }

  evidenciasDe(visita?: IVisitaLote): IFoto[] {
    if (!visita?._id) return [];
    return this.evidencias.filter(
      (evidencia) => String(evidencia.idVisita || '') === String(visita._id),
    );
  }

  audioDe(audio: IFoto): string {
    return audio._id ? this.audiosAutenticados.get(audio._id) || '' : '';
  }

  tipoLabel(tipo?: TTipoVisitaLote): string {
    return this.tipos.find((item) => item.value === tipo)?.label || 'Visita al lote';
  }

  evidenciaLabel(evidencia: IFoto): string {
    if (evidencia.titulo) return evidencia.titulo;
    return evidencia.tipoMedio === 'audio' ? 'Audio de campo' : 'Foto de campo';
  }

  toggleActividad(value: TActividadVisitaLote): void {
    if (this.helper.soloLectura()) return;
    this.actividades = this.actividades.includes(value)
      ? this.actividades.filter((item) => item !== value)
      : [...this.actividades, value];
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

  async guardar(): Promise<void> {
    if (!this.lote?._id || !this.titulo.trim() || !this.fechaVisita || this.guardando) return;
    this.guardando = true;
    const data: ICreateVisitaLote = {
      idLote: this.lote._id,
      titulo: this.titulo,
      fechaVisita: new Date(`${this.fechaVisita}T12:00:00`).toISOString(),
      horaInicio: this.horaInicio || undefined,
      horaFin: this.horaFin || undefined,
      tipo: this.tipo,
      estado: this.estado,
      actividades: this.actividades,
      participantes: this.participantes.split(',').map((x) => x.trim()).filter(Boolean),
      observaciones: this.observaciones,
      hallazgos: this.hallazgos,
      recomendaciones: this.recomendaciones,
      proximaVisita: this.proximaVisita ? new Date(`${this.proximaVisita}T12:00:00`).toISOString() : undefined,
      latitud: this.latitud,
      longitud: this.longitud,
      precisionMetros: this.precisionMetros,
    };
    try {
      if (this.editando?._id) await this.visitasService.actualizar(this.editando._id, data);
      else await this.visitasService.crear(data);
      this.helper.notifSuccess(this.editando ? 'Visita actualizada' : 'Visita registrada');
      this.dialogo = false;
      await this.cargar();
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.guardando = false;
    }
  }

  archivar(): void {
    if (!this.editando?._id) return;
    this.confirmation.confirm({
      header: 'Archivar visita',
      message: 'La visita dejara de mostrarse en el calendario, pero se conservara para auditoria.',
      icon: 'pi pi-archive',
      acceptLabel: 'Archivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        try {
          await this.visitasService.archivar(this.editando!._id!);
          this.helper.notifSuccess('Visita archivada');
          this.dialogo = false;
          await this.cargar();
        } catch (error) {
          this.helper.notifError(error);
        }
      },
    });
  }

  estadoLabel(estado?: TEstadoVisitaLote): string {
    return estado === 'programada' ? 'Programada' : estado === 'cancelada' ? 'Cancelada' : 'Realizada';
  }

  fechaLabel(value?: string): string {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  }

  private limpiarFormulario(): void {
    this.editando = undefined;
    this.titulo = 'Recorrida de lote';
    this.fechaVisita = this.fechaInput(new Date());
    this.horaInicio = '';
    this.horaFin = '';
    this.tipo = 'recorrida_general';
    this.estado = 'realizada';
    this.actividades = [];
    this.participantes = '';
    this.observaciones = '';
    this.hallazgos = '';
    this.recomendaciones = '';
    this.proximaVisita = '';
    this.latitud = undefined;
    this.longitud = undefined;
    this.precisionMetros = undefined;
  }

  private fechaInput(value: Date): string {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private timestamp(value?: string): number {
    return value ? new Date(value).getTime() || 0 : 0;
  }

  private async cargarAudioAutenticado(audio: IFoto, ciclo: number): Promise<void> {
    if (!audio._id) return;
    try {
      const blob = await this.fotosService.getAudio(audio._id);
      if (
        ciclo !== this.cicloCargaAudios ||
        !this.evidenciasDe(this.editando).some((item) => item._id === audio._id)
      ) {
        return;
      }
      const mime = /^audio\//i.test(blob.type)
        ? blob.type
        : String(audio.mimeType || 'audio/webm');
      const objectUrl = URL.createObjectURL(blob.slice(0, blob.size, mime));
      if (ciclo !== this.cicloCargaAudios) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      this.audiosAutenticados.set(audio._id, objectUrl);
    } catch {
      // La visita y la metadata siguen visibles si el archivo no esta disponible.
    }
  }

  private async refrescarEvidenciasVisita(
    visita: IVisitaLote,
    ciclo: number,
  ): Promise<void> {
    if (!this.lote?._id) return;
    try {
      const response = await this.fotosService.listarPorLote(this.lote._id);
      if (ciclo !== this.cicloCargaAudios || this.editando?._id !== visita._id) return;
      this.evidencias = (response.datos || []).filter(
        (evidencia) =>
          evidencia.fuente === 'campo' &&
          !evidencia.archivado &&
          !!evidencia.idVisita,
      );
      for (const audio of this.evidenciasDe(visita).filter(
        (evidencia) => evidencia.tipoMedio === 'audio',
      )) {
        void this.cargarAudioAutenticado(audio, ciclo);
      }
    } catch {
      // Los comentarios siguen disponibles si la evidencia no puede refrescarse.
    }
  }

  private liberarAudiosAutenticados(): void {
    this.audiosAutenticados.forEach((url) => URL.revokeObjectURL(url));
    this.audiosAutenticados.clear();
  }
}
