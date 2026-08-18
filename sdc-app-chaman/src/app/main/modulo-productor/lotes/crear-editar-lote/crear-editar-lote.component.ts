import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  ICoordenadas,
  ICreateLote,
  IDispositivo,
  IEstablecimiento,
  IEstacion,
  IFilter,
  IGeoJSONPoint,
  IGeoJSONPolygon,
  IListado,
  IQueryParam,
  ISuelo,
  ISueloReferencia,
  TTexturaSuelo,
  TTipoContenidoP,
  TTipoDepositoN,
  TTipoDrenaje,
  TTipoErosionEscorrentiaPendiente,
} from 'modelos/src';
import { FileSelectEvent } from 'primeng/fileupload';
import { Subscription } from 'rxjs';
import { MapDrawComponent } from '../../../../auxiliares/componentes/map-draw/map-draw.component';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { IKmzPolygonImportado, KmlKmzImportService } from '../../../../auxiliares/servicios/kml-kmz-import.service';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';

type SoilOverridePayloadName =
  | 'suelos'
  | 'capacidadDeCampo'
  | 'puntoMarchitez'
  | 'sueloReferencia'
  | 'texturaLixiviacion'
  | 'texturaEscorrentia';

@Component({
  selector: 'app-crear-editar-lote',
  imports: [SharedModule, MapDrawComponent],
  templateUrl: './crear-editar-lote.component.html',
  styleUrl: './crear-editar-lote.component.scss',
})
export class CrearEditarLoteComponent implements OnInit, OnDestroy {
  public loading = false;
  public lote?: ILoteTabla;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public establecimientos: IEstablecimiento[] = [];
  public establecimientos$?: Subscription;
  public sondasSuelo: IEstacion[] = [];
  public sondasSuelo$?: Subscription;
  public dispositivos: IDispositivo[] = [];
  public dispositivos$?: Subscription;

  public centroMapa?: IGeoJSONPoint;

  public distanciaSonda?: string;
  public sueloIntaLoading = false;
  public sueloIntaInfo?: any;
  public kmzImportando = false;
  public kmzNombreArchivo = '';
  public kmzPoligonos: IKmzPolygonImportado[] = [];
  private readonly explicitlyEditedSoilPayloadNames = new Set<SoilOverridePayloadName>();
  private readonly soilOverridePayloadNames: SoilOverridePayloadName[] = [
    'suelos',
    'capacidadDeCampo',
    'puntoMarchitez',
    'sueloReferencia',
    'texturaLixiviacion',
    'texturaEscorrentia',
  ];

  public texturas: TTexturaSuelo[] = [
    'Arcilloso',
    'Franco arcilloso',
    'Franco',
    'Franco limoso',
    'Limoso',
    'Franco arenoso',
    'Arenoso',
  ];

  public depositoN: TTipoDepositoN[] = ['< 0.5', '> 0.5', '< 1.5', '> 1.5'];
  public drenaje: TTipoDrenaje[] = ['Mal Drenado', 'Moderadamente Drenado', 'Bien Drenado', 'Excesivamente Drenado'];
  public erosionEscorrentiaPendiente: TTipoErosionEscorrentiaPendiente[] = [
    'Baja (0 - 3%)',
    'Moderada (3 - 8%)',
    'Alta (8 - 15%)',
    'Muy Alta (> 15%)',
  ];
  public contenidoP: TTipoContenidoP[] = ['< 12', '> 12 < 20', '> 20 < 30', '> 30'];

  public get suelos() {
    return this.form?.get('suelos') as FormArray;
  }

  get geojson() {
    return this.form?.get('ubicacion.geojson') as FormGroup;
  }
  get sueloReferenciaActual(): ISueloReferencia | undefined {
    return this.sueloIntaInfo?.resumen || this.form?.get('sueloReferencia')?.value || this.lote?.sueloReferencia;
  }
  get establecimientoSeleccionado(): IEstablecimiento | undefined {
    const idEstablecimiento = this.form?.get('idEstablecimiento')?.value;
    return this.establecimientos.find((establecimiento) => establecimiento._id === idEstablecimiento);
  }
  get geoJsonEstablecimiento() {
    return this.establecimientoSeleccionado?.ubicacion?.filter((d) => d.geojson).map((d) => d.geojson!) || [];
  }
  get dispositivosSeleccionados(): IDispositivo[] {
    const ids: string[] = this.form?.get('idsDispositivo')?.value || [];
    return this.dispositivos.filter((dispositivo) => dispositivo._id && ids.includes(dispositivo._id));
  }
  get lanzaSueloSeleccionada(): IDispositivo | undefined {
    return this.dispositivosSeleccionados.find((dispositivo) => this.esLanzaSuelo(dispositivo));
  }
  get cantidadCapasLanza(): number {
    return this.cantidadCapasDispositivo(this.lanzaSueloSeleccionada);
  }
  get resumenCapasLanza(): string {
    const cantidad = this.cantidadCapasLanza;
    if (!cantidad) return 'Sin capas detectadas';
    const profundidades = this.profundidadesLanza(this.lanzaSueloSeleccionada);
    if (profundidades.length) {
      return `${cantidad} capas: ${profundidades.map((profundidad) => `${profundidad} cm`).join(', ')}`;
    }
    return `${cantidad} capas de medicion`;
  }
  get referenciaUbicacionEstablecimiento(): string {
    const ubicacion = this.establecimientoSeleccionado?.ubicacionOficial;
    const partes = [
      ubicacion?.localidadReferencia?.nombre,
      ubicacion?.nivelAdministrativo2?.nombre,
      ubicacion?.provincia?.nombre,
    ].filter(Boolean);
    if (partes.length) return partes.join(' / ');
    return 'La ubicacion oficial del establecimiento esta en proceso';
  }
  get departamentoHeredadoTexto(): string | undefined {
    const ubicacion = this.establecimientoSeleccionado?.ubicacionOficial;
    return ubicacion?.nivelAdministrativo2?.nombre;
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: LoteService,
    private helper: HelperService,
    private listado: ListadosService,
    private activatedRoute: ActivatedRoute,
    private kmlKmzImport: KmlKmzImportService
  ) {}

  // FORMULARIO
  private initSuelos() {
    const array: FormGroup[] = [];
    if (this.lote?.suelos?.length) {
      for (const p of this.lote.suelos) {
        array.push(this.agregarSueloFormGroup(p));
      }
      return array;
    }
    return array;
  }
  public agregarSueloFormGroup(p?: ISuelo): FormGroup {
    return new FormGroup({
      profundidad: new FormControl(p?.profundidad),
      textura: new FormControl(p?.textura),
      hayRaices: new FormControl(p?.hayRaices),
      capacidadDeCampo: new FormControl(p?.capacidadDeCampo),
      puntoMarchitez: new FormControl(p?.puntoMarchitez),
      numeroDeSensor: new FormControl(p?.numeroDeSensor),
    });
  }
  public agregarSuelo() {
    this.markSoilPayloadEdited('suelos');
    this.suelos.push(this.agregarSueloFormGroup(this.sueloNuevoSugerido()));
    this.suelos.markAsDirty();
  }
  public borrarSuelo(i: number) {
    this.markSoilPayloadEdited('suelos');
    this.suelos.removeAt(i);
    this.suelos.markAsDirty();
  }
  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.lote?.nombre, Validators.required),
      idEstablecimiento: new FormControl(this.lote?.idEstablecimiento, Validators.required),
      idSondaSuelo: new FormControl(this.lote?.idSondaSuelo),
      idsDispositivo: new FormControl(this.lote?.idsDispositivo || []),
      sueloReferencia: new FormControl(this.lote?.sueloReferencia),
      tipoSueloManual: new FormControl(this.texturaInicialLote()),
      capacidadDeCampo: new FormControl(this.lote?.capacidadDeCampo),
      puntoMarchitez: new FormControl(this.lote?.puntoMarchitez),
      capacidadDeRiego: new FormControl(this.lote?.capacidadDeRiego),
      eficienciaRiego: new FormControl(this.lote?.eficienciaRiego, [
        Validators.min(10),
        Validators.max(100),
      ]),
      anchoDeBulbo: new FormControl(this.lote?.anchoDeBulbo),
      metrosLinealesHas: new FormControl(this.lote?.metrosLinealesHas),
      ubicacion: new FormGroup({
        geojson: new FormGroup({
          type: new FormControl('Polygon', [Validators.required]),
          coordinates: new FormControl(this.lote?.ubicacion?.geojson?.coordinates),
        }),
        centro: new FormControl(this.lote?.ubicacion?.centro),
        superficie: new FormControl(this.lote?.ubicacion?.superficie),
      }),
      suelos: new FormArray(this.initSuelos()),

      // Datos para Huella Hídrica
      depositoN: new FormControl(this.lote?.depositoN),
      texturaLixiviacion: new FormControl(this.lote?.texturaLixiviacion),
      texturaEscorrentia: new FormControl(this.lote?.texturaEscorrentia),
      drenajeNaturalLixiviacion: new FormControl(this.lote?.drenajeNaturalLixiviacion),
      drenajeNaturalEscorrentia: new FormControl(this.lote?.drenajeNaturalEscorrentia),
      erosionEscorrentiaPendiente: new FormControl(this.lote?.erosionEscorrentiaPendiente),
      contenidoP: new FormControl(this.lote?.contenidoP),
    });
  }

  // FUNCIONES
  public cambioEstablecimiento(): void {
    this.sincronizarDesdeEstablecimiento();
  }

  public cambioSondaSuelo() {
    const idSondaSuelo = this.form?.get('idSondaSuelo')?.value;
    const sondaSuelo = this.sondasSuelo.find((d) => d._id === idSondaSuelo);
    if (!sondaSuelo) return;
    const geojsonLote = this.geojson?.value as IGeoJSONPolygon;
    if (!geojsonLote?.coordinates?.length) return;
    const centroLote: IGeoJSONPoint = {
      type: 'Point',
      coordinates: this.helper.calcularCentroide(geojsonLote),
    };
    const centroSonda = sondaSuelo.position?.geo as IGeoJSONPoint;
    if (!centroSonda || !centroLote) {
      this.distanciaSonda = '';
      return;
    }
    const distanciaSonda = Math.trunc(this.helper.calcularDistancia(centroLote, centroSonda));
    if (distanciaSonda > 1000) {
      this.distanciaSonda = `${Math.trunc(distanciaSonda / 1000)} km`;
    } else {
      this.distanciaSonda = `${distanciaSonda} m`;
    }
  }

  public onDispositivosChange(userInitiated = true): void {
    const lanza = this.lanzaSueloSeleccionada;
    if (!lanza) return;
    if (this.debeAutocompletarCapasDesdeLanza()) {
      this.prepararCapasDesdeLanza(false, userInitiated);
    }
  }

  public cambioTipoSueloManual(aplicarValores = true): void {
    if (!this.form) return;
    const textura = this.form.get('tipoSueloManual')?.value as TTexturaSuelo | undefined;
    if (!textura) return;
    if (aplicarValores) {
      this.markSoilPayloadEdited(
        'suelos',
        'capacidadDeCampo',
        'puntoMarchitez',
        'texturaLixiviacion',
        'texturaEscorrentia'
      );
    }
    const agua = this.capacidadPorTextura(textura);

    const capacidadActual = this.form.get('capacidadDeCampo')?.value;
    const marchitezActual = this.form.get('puntoMarchitez')?.value;
    const capacidadDeCampo =
      aplicarValores || this.esValorVacio(capacidadActual) ? agua.capacidadDeCampo : capacidadActual;
    const puntoMarchitez = aplicarValores || this.esValorVacio(marchitezActual) ? agua.puntoMarchitez : marchitezActual;

    this.form.patchValue(
      {
        capacidadDeCampo,
        puntoMarchitez,
        texturaLixiviacion: textura,
        texturaEscorrentia: textura,
      },
      { emitEvent: false }
    );

    this.sincronizarSueloManualEnCapas();
  }

  public prepararCapasDesdeLanza(forzar = true, markAsUserEdit = true): void {
    const lanza = this.lanzaSueloSeleccionada;
    const profundidades = this.profundidadesLanza(lanza);
    if (!lanza || !profundidades.length || !this.suelos) {
      this.helper.notifWarn('No pude detectar capas de medicion en la lanza seleccionada.');
      return;
    }

    for (let i = 0; i < profundidades.length; i++) {
      if (!this.suelos.at(i)) {
        this.suelos.push(
          this.agregarSueloFormGroup({
            numeroDeSensor: i + 1,
            profundidad: profundidades[i],
            hayRaices: i < 6,
          })
        );
        continue;
      }

      const group = this.suelos.at(i) as FormGroup;
      const patch: Partial<ISuelo> = {};
      if (forzar || this.esValorVacio(group.get('numeroDeSensor')?.value)) patch.numeroDeSensor = i + 1;
      if (forzar || this.esValorVacio(group.get('profundidad')?.value)) patch.profundidad = profundidades[i];
      if (forzar || this.esValorVacio(group.get('hayRaices')?.value)) patch.hayRaices = i < 6;
      group.patchValue(patch);
    }

    if (markAsUserEdit) {
      this.suelos.markAsDirty();
      this.markSoilPayloadEdited('suelos');
      this.helper.notifSuccess(`${profundidades.length} capas de suelo preparadas desde la lanza seleccionada.`);
    }
  }

  public esLanzaSuelo(dispositivo?: IDispositivo): boolean {
    if (!dispositivo) return false;
    const texto = this.textoDispositivo(dispositivo);
    return (
      texto.includes('lanza') ||
      texto.includes('sentek') ||
      texto.includes('humedad de suelo') ||
      (dispositivo.sensores || []).some((sensor) => this.normalizarTexto(sensor).includes('humedad suelo profundidad'))
    );
  }

  public async autocompletarSueloInta(): Promise<void> {
    if (!this.form) return;
    const data = this.getData();
    const centro = data.ubicacion?.centro as ICoordenadas | undefined;

    if (!centro || !Number.isFinite(centro.lat) || !Number.isFinite(centro.lng)) {
      this.helper.notifWarn('Dibuja el lote en el mapa antes de consultar el suelo INTA.');
      this.tabValue = 1;
      return;
    }

    this.sueloIntaLoading = true;
    try {
      const info = await this.service.sueloInta(centro.lat, centro.lng);
      this.sueloIntaInfo = info;

      if (!info?.encontrado || !info?.sugerencias) {
        this.helper.notifWarn(info?.mensaje || 'INTA no devolvio datos para esta ubicacion.');
        return;
      }

      const sugerencias = info.sugerencias;
      const patch: Record<string, any> = {};
      for (const key of [
        'sueloReferencia',
        'capacidadDeCampo',
        'puntoMarchitez',
        'texturaLixiviacion',
        'texturaEscorrentia',
        'drenajeNaturalLixiviacion',
        'drenajeNaturalEscorrentia',
        'erosionEscorrentiaPendiente',
      ]) {
        if (sugerencias[key] !== undefined && sugerencias[key] !== null) {
          patch[key] = sugerencias[key];
        }
      }
      this.form.patchValue(patch);
      for (const name of this.soilOverridePayloadNames) {
        if (Object.prototype.hasOwnProperty.call(patch, name)) {
          this.markSoilPayloadEdited(name);
        }
      }

      if (sugerencias.suelos?.length) {
        this.suelos.clear();
        for (const suelo of sugerencias.suelos) {
          this.suelos.push(this.agregarSueloFormGroup(suelo));
        }
        this.markSoilPayloadEdited('suelos');
      }

      this.helper.notifSuccess('Suelo INTA aplicado. Podes ajustar los valores antes de guardar.');
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.sueloIntaLoading = false;
    }
  }

  private sueloNuevoSugerido(): ISuelo {
    const textura = this.texturaPrincipalLote();
    const agua = this.capacidadPorTextura(textura);
    return {
      textura,
      hayRaices: true,
      capacidadDeCampo: agua.capacidadDeCampo,
      puntoMarchitez: agua.puntoMarchitez,
    };
  }

  private debeAutocompletarCapasDesdeLanza(): boolean {
    if (!this.suelos?.length) return true;
    if (this.suelos.length > 1) return false;
    const value = this.suelos.at(0)?.value as ISuelo | undefined;
    return !value || (this.esValorVacio(value.numeroDeSensor) && this.esValorVacio(value.profundidad));
  }

  private cantidadCapasDispositivo(dispositivo?: IDispositivo): number {
    if (!dispositivo) return 0;
    const profundidades = this.profundidadesDesdeDispositivo(dispositivo);
    if (profundidades.length) return profundidades.length;

    const texto = this.textoDispositivo(dispositivo);
    if (texto.includes('sentek') || texto.includes('lanza') || texto.includes('humedad de suelo')) {
      return 12;
    }
    return 0;
  }

  private profundidadesLanza(dispositivo?: IDispositivo): number[] {
    const detectadas = this.profundidadesDesdeDispositivo(dispositivo);
    if (detectadas.length) return detectadas;

    const cantidad = this.cantidadCapasDispositivo(dispositivo);
    if (!cantidad) return [];
    return Array.from({ length: cantidad }, (_, index) => (index + 1) * 10);
  }

  private profundidadesDesdeDispositivo(dispositivo?: IDispositivo): number[] {
    if (!dispositivo) return [];
    const profundidades = new Set<number>();

    const valores = (dispositivo.ultimoReporte?.datos as any)?.valores || {};
    for (const key of ['Humedad Suelo Profundidad', 'Salinidad Suelo', 'Temperatura Suelo']) {
      const mediciones = valores[key];
      if (!Array.isArray(mediciones)) continue;
      for (const medicion of mediciones) {
        const profundidad = this.toNumero(medicion?.profundidad);
        if (profundidad) profundidades.add(profundidad);
      }
    }

    for (const sensor of dispositivo.sensores || []) {
      const profundidad = this.extraerProfundidad(`${sensor}`);
      if (profundidad) profundidades.add(profundidad);
    }

    return Array.from(profundidades).sort((a, b) => a - b);
  }

  private extraerProfundidad(value?: string): number | undefined {
    const match = `${value || ''}`.match(/(\d{1,3})\s*cm/i);
    if (!match) return undefined;
    return this.toNumero(match[1]);
  }

  private texturaPrincipalLote(): TTexturaSuelo | undefined {
    const manual = this.form?.get('tipoSueloManual')?.value as TTexturaSuelo | undefined;
    if (manual) return manual;

    const existente = (this.suelos?.controls || [])
      .map((control) => control.get('textura')?.value as TTexturaSuelo | undefined)
      .find(Boolean);
    if (existente) return existente;

    const desdeHuella = (this.form?.get('texturaLixiviacion')?.value || this.form?.get('texturaEscorrentia')?.value) as
      | TTexturaSuelo
      | undefined;
    if (desdeHuella) return desdeHuella;

    return this.texturaDesdeTexto(
      this.sueloReferenciaActual?.texturaSuperficial || this.sueloReferenciaActual?.texturaSubsuelo
    );
  }

  private texturaInicialLote(): TTexturaSuelo | undefined {
    const desdePerfil = this.lote?.suelos?.map((suelo) => suelo.textura).find(Boolean) as TTexturaSuelo | undefined;
    const desdeHuella = (this.lote?.texturaLixiviacion || this.lote?.texturaEscorrentia) as TTexturaSuelo | undefined;
    const desdeReferencia = this.texturaDesdeTexto(
      this.lote?.sueloReferencia?.texturaSuperficial || this.lote?.sueloReferencia?.texturaSubsuelo
    );
    return desdePerfil || desdeHuella || desdeReferencia;
  }

  private sincronizarSueloManualEnCapas(): void {
    if (!this.form || !this.suelos) return;

    const textura = this.form.get('tipoSueloManual')?.value as TTexturaSuelo | undefined;
    if (!textura) return;
    const agua = this.capacidadPorTextura(textura);
    const capacidadDeCampo = this.form.get('capacidadDeCampo')?.value ?? agua.capacidadDeCampo;
    const puntoMarchitez = this.form.get('puntoMarchitez')?.value ?? agua.puntoMarchitez;

    if (!this.suelos.length) {
      this.suelos.push(
        this.agregarSueloFormGroup({
          textura,
          capacidadDeCampo,
          puntoMarchitez,
          hayRaices: true,
        })
      );
      return;
    }

    for (const control of this.suelos.controls) {
      (control as FormGroup).patchValue(
        {
          textura,
          capacidadDeCampo,
          puntoMarchitez,
        },
        { emitEvent: false }
      );
    }
  }

  private texturaDesdeTexto(value?: string): TTexturaSuelo | undefined {
    const texto = this.normalizarTexto(value);
    if (!texto) return undefined;
    if (texto.includes('lim') && texto.includes('franco')) return 'Franco limoso';
    if (texto.includes('lim')) return 'Limoso';
    if (texto.includes('aren') && texto.includes('franco')) return 'Franco arenoso';
    if (texto.includes('aren')) return 'Arenoso';
    if (texto.includes('arcill') && texto.includes('franco')) return 'Franco arcilloso';
    if (texto.includes('arcill')) return 'Arcilloso';
    return texto.includes('franco') ? 'Franco' : undefined;
  }

  private capacidadPorTextura(textura?: TTexturaSuelo): Pick<ISuelo, 'capacidadDeCampo' | 'puntoMarchitez'> {
    const valores: Record<TTexturaSuelo, Pick<ISuelo, 'capacidadDeCampo' | 'puntoMarchitez'>> = {
      Arcilloso: { capacidadDeCampo: 40, puntoMarchitez: 22 },
      'Franco arcilloso': { capacidadDeCampo: 35, puntoMarchitez: 18 },
      Franco: { capacidadDeCampo: 30, puntoMarchitez: 14 },
      'Franco limoso': { capacidadDeCampo: 32, puntoMarchitez: 15 },
      Limoso: { capacidadDeCampo: 31, puntoMarchitez: 13 },
      'Franco arenoso': { capacidadDeCampo: 22, puntoMarchitez: 10 },
      Arenoso: { capacidadDeCampo: 14, puntoMarchitez: 6 },
    };
    return textura ? valores[textura] : {};
  }

  private textoDispositivo(dispositivo: IDispositivo): string {
    return this.normalizarTexto(
      [dispositivo.nombre, dispositivo.tipo, dispositivo.deveui, ...(dispositivo.sensores || [])].join(' ')
    );
  }

  private esValorVacio(value: unknown): boolean {
    return value === undefined || value === null || value === '';
  }

  private toNumero(value: unknown): number | undefined {
    const numero = Number(value);
    return Number.isFinite(numero) ? numero : undefined;
  }

  // ACCIONES

  private getData() {
    this.sincronizarDesdeEstablecimiento();
    const data: ICreateLote = this.form?.value;
    this.omitUnchangedSoilOverrides(data);
    delete (data as any).tipoSueloManual;
    delete (data as any).idDepartamento;
    if (data.ubicacion?.geojson?.coordinates?.length) {
      const centro = this.helper.calcularCentroide(data.ubicacion.geojson);
      data.ubicacion.centro = { lat: centro[1], lng: centro[0] };
      data.ubicacion.superficie = this.helper.calcularAreaHectareas(data.ubicacion.geojson);
      this.form?.get('ubicacion.centro')?.setValue(data.ubicacion.centro, { emitEvent: false });
      this.form?.get('ubicacion.superficie')?.setValue(data.ubicacion.superficie, { emitEvent: false });
    } else if (this.form?.get('ubicacion.centro')?.value) {
      data.ubicacion = data.ubicacion || {};
      data.ubicacion.centro = this.form.get('ubicacion.centro')?.value;
    }
    return data;
  }

  private markSoilPayloadEdited(...names: SoilOverridePayloadName[]): void {
    for (const name of names) this.explicitlyEditedSoilPayloadNames.add(name);
  }

  private soilPayloadWasEdited(name: SoilOverridePayloadName): boolean {
    if (this.explicitlyEditedSoilPayloadNames.has(name)) return true;
    if (name === 'suelos') return !!this.suelos?.dirty;
    return !!this.form?.get(name)?.dirty;
  }

  private omitUnchangedSoilOverrides(data: ICreateLote): void {
    for (const name of this.soilOverridePayloadNames) {
      if (!this.soilPayloadWasEdited(name)) {
        delete (data as Record<string, unknown>)[name];
      }
    }
    if (Object.prototype.hasOwnProperty.call(data, 'suelos')) {
      data.suelos = this.sanitizeSoilLayers(data.suelos);
    }
  }

  private sanitizeSoilLayers(layers?: ISuelo[]): ISuelo[] {
    return (layers || [])
      .map((layer) => {
        const clean = { ...layer } as Record<string, unknown>;
        for (const [key, value] of Object.entries(clean)) {
          if (value === undefined || value === null || value === '') delete clean[key];
        }
        return clean as ISuelo;
      })
      .filter((layer) => Object.keys(layer).length > 0);
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.lote?._id) {
        await this.service.editar(this.lote._id, data);

        // Solo actualiza el item en cache
        this.listado.patchEntityItem('lotes', {
          _id: this.lote._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);

        // Solo actualiza el item en cache
        this.listado.createEntityItem('lotes', created);

        this.helper.notifSuccess(this.translate.instant('Creado correctamente'));
      }
      this.volver();
    } catch (err) {
      console.error(err);
      this.helper.notifError(err);
    }
    this.loading = false;
  }

  public volver() {
    window.history.back();
  }

  // IMPORTACION KMZ/KML

  public async importarKmzKml(event: FileSelectEvent): Promise<void> {
    const file = event.files?.[0];
    if (!file) {
      this.helper.notifWarn('Selecciona un archivo KML o KMZ.');
      return;
    }

    this.kmzImportando = true;
    this.kmzNombreArchivo = file.name;
    try {
      this.kmzPoligonos = await this.kmlKmzImport.leerPoligonos(file);
      if (this.kmzPoligonos.length === 1) {
        this.aplicarPoligonoImportado(this.kmzPoligonos[0]);
        this.helper.notifSuccess('Poligono importado. Revisa el mapa, suelo y riego antes de guardar.');
      } else {
        this.helper.notifSuccess(
          `${this.kmzPoligonos.length} lotes detectados. Selecciona establecimiento y crea todos.`
        );
      }
    } catch (error) {
      this.helper.notifError(error);
      this.kmzPoligonos = [];
    } finally {
      this.kmzImportando = false;
    }
  }

  public aplicarPoligonoImportado(poligono: IKmzPolygonImportado): void {
    if (!this.form || !poligono?.geojson?.coordinates?.length) return;
    if (!this.form.get('nombre')?.value) {
      this.form.get('nombre')?.setValue(poligono.nombre);
    }
    this.form.patchValue(
      {
        ubicacion: {
          geojson: {
            type: 'Polygon',
            coordinates: poligono.geojson.coordinates,
          },
          centro: poligono.centro,
          superficie: poligono.superficie,
        },
      },
      { emitEvent: false }
    );
    this.centroMapa = {
      type: 'Point',
      coordinates: [poligono.centro.lng, poligono.centro.lat],
    };
    this.cambioSondaSuelo();
    this.tabValue = 1;
  }

  public async crearLotesImportados(): Promise<void> {
    if (!this.kmzPoligonos.length || !this.form) return;
    const idEstablecimiento = this.form.get('idEstablecimiento')?.value;
    if (!idEstablecimiento) {
      this.helper.notifWarn('Selecciona un establecimiento antes de crear lotes desde KMZ/KML.');
      this.tabValue = 0;
      return;
    }

    const cantidad = this.kmzPoligonos.length;
    const confirmar = window.confirm(
      `Crear ${cantidad} lote${cantidad === 1 ? '' : 's'} en el establecimiento seleccionado?`
    );
    if (!confirmar) return;

    this.loading = true;
    let creados = 0;
    let errores = 0;
    try {
      this.sincronizarDesdeEstablecimiento();

      for (const poligono of this.kmzPoligonos) {
        try {
          const created = await this.service.crear(this.getDataLoteImportado(poligono));
          this.listado.createEntityItem('lotes', created);
          creados += 1;
        } catch (error) {
          errores += 1;
          console.error('No se pudo crear lote importado.', error);
        }
      }

      if (creados) {
        this.helper.notifSuccess(
          `${creados} lote${creados === 1 ? '' : 's'} creado${creados === 1 ? '' : 's'} desde KMZ/KML.`
        );
      }
      if (errores) {
        this.helper.notifWarn(
          `${errores} poligono${errores === 1 ? '' : 's'} no se pudieron crear. Revisa permisos o datos del archivo.`
        );
      }
      if (creados) this.volver();
    } finally {
      this.loading = false;
    }
  }

  private getDataLoteImportado(poligono: IKmzPolygonImportado): ICreateLote {
    const geojson = poligono.geojson;
    const suelos = ((this.suelos?.value || []) as ISuelo[]).map((suelo) => ({ ...suelo }));
    const data: ICreateLote = {
      nombre: poligono.nombre,
      idEstablecimiento: this.form?.get('idEstablecimiento')?.value,
      sueloReferencia: this.form?.get('sueloReferencia')?.value,
      capacidadDeCampo: this.form?.get('capacidadDeCampo')?.value,
      puntoMarchitez: this.form?.get('puntoMarchitez')?.value,
      capacidadDeRiego: this.form?.get('capacidadDeRiego')?.value,
      eficienciaRiego: this.form?.get('eficienciaRiego')?.value,
      anchoDeBulbo: this.form?.get('anchoDeBulbo')?.value,
      metrosLinealesHas: this.form?.get('metrosLinealesHas')?.value,
      ubicacion: {
        geojson,
        centro: poligono.centro,
        superficie: poligono.superficie,
      },
      suelos,
      depositoN: this.form?.get('depositoN')?.value,
      texturaLixiviacion: this.form?.get('texturaLixiviacion')?.value,
      texturaEscorrentia: this.form?.get('texturaEscorrentia')?.value,
      drenajeNaturalLixiviacion: this.form?.get('drenajeNaturalLixiviacion')?.value,
      drenajeNaturalEscorrentia: this.form?.get('drenajeNaturalEscorrentia')?.value,
      erosionEscorrentiaPendiente: this.form?.get('erosionEscorrentiaPendiente')?.value,
      contenidoP: this.form?.get('contenidoP')?.value,
    };
    this.omitUnchangedSoilOverrides(data);
    return data;
  }

  private sincronizarDesdeEstablecimiento(): void {
    const establecimiento = this.establecimientoSeleccionado;
    if (!establecimiento || !this.form) return;
    this.centrarMapaDesdeEstablecimiento(establecimiento);
  }

  private centrarMapaDesdeEstablecimiento(establecimiento?: IEstablecimiento): void {
    const centro = this.obtenerCentroEstablecimiento(establecimiento);
    if (!centro) return;
    this.form?.get('ubicacion.centro')?.setValue(centro, { emitEvent: false });
    this.centroMapa = {
      type: 'Point',
      coordinates: [centro.lng, centro.lat],
    };
  }

  private obtenerCentroEstablecimiento(establecimiento?: IEstablecimiento): ICoordenadas | undefined {
    const puntoOficial = establecimiento?.ubicacionOficial?.puntoRepresentativo?.coordinates;
    if (puntoOficial?.length) {
      return { lng: puntoOficial[0], lat: puntoOficial[1] };
    }
    const administrativa = establecimiento?.ubicacionAdministrativa?.coordenadas;
    if (this.coordenadasValidas(administrativa)) return administrativa;

    const centroGuardado = establecimiento?.ubicacion?.find((ubicacion) =>
      this.coordenadasValidas(ubicacion.centro)
    )?.centro;
    if (this.coordenadasValidas(centroGuardado)) return centroGuardado;

    const geojson = establecimiento?.ubicacion?.find((ubicacion) => ubicacion.geojson?.coordinates)?.geojson;
    if (!geojson) return undefined;

    const centro = this.helper.calcularCentroide(geojson);
    if (!centro?.length) return undefined;
    return { lat: centro[1], lng: centro[0] };
  }

  private coordenadasValidas(coordenadas?: ICoordenadas): coordenadas is ICoordenadas {
    return Number.isFinite(coordenadas?.lat) && Number.isFinite(coordenadas?.lng);
  }

  private normalizarTexto(value?: unknown): string {
    return `${value || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async cargarListadoInicial(nombre: string, tarea: () => Promise<void>, timeoutMs = 12000): Promise<void> {
    let finalizada = false;
    const tareaSegura = tarea()
      .catch((error) => console.warn(`No se pudo cargar ${nombre}.`, error))
      .finally(() => {
        finalizada = true;
      });
    await Promise.race([
      tareaSegura,
      new Promise<void>((resolve) =>
        setTimeout(() => {
          if (!finalizada)
            console.warn(`${nombre} no respondio antes de ${timeoutMs} ms; la pantalla queda operativa.`);
          resolve();
        }, timeoutMs)
      ),
    ]);
  }

  // LISTADOS

  private async listarEstablecimientos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
    };

    this.establecimientos$?.unsubscribe();
    this.establecimientos$ = this.listado
      .subscribe<IListado<IEstablecimiento>>('establecimientos', queryParams)
      .subscribe(async (data) => {
        this.establecimientos = data.datos;
        this.sincronizarDesdeEstablecimiento();
        console.log(`listado de establecimientos`, data);
      });
    await this.listado.getLastValue('establecimientos', queryParams);
  }
  private async listarSondasSuelo(): Promise<void> {
    const filter: IFilter<IEstacion> = {
      'meta.soilTemp': { $exists: true },
      'meta.volumetricAverage': { $exists: true },
    } as any;
    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      select: 'name.custom position.geo',
      sort: 'name.custom',
    };
    this.sondasSuelo$?.unsubscribe();
    this.sondasSuelo$ = this.listado.subscribe<IListado<IEstacion>>('estaciones', query).subscribe((data) => {
      this.sondasSuelo = data.datos;
      console.log(`listado de sondas de suelo`, data);
    });
    await this.listado.getLastValue('estaciones', query);
  }
  private async listarDispositivos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      select: 'nombre tipo deveui sensores ultimoReporte metadata fechaUltimaComunicacion',
    };

    this.dispositivos$?.unsubscribe();
    this.dispositivos$ = this.listado
      .subscribe<IListado<IDispositivo>>('dispositivos', queryParams)
      .subscribe(async (data) => {
        this.dispositivos = data.datos;
        console.log(`listado de dispositivos`, data);
      });
    await this.listado.getLastValue('dispositivos', queryParams);
  }

  //

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      this.lote = this.paramsService.get('editLote') || undefined;
      const idLote = this.activatedRoute.snapshot.paramMap.get('id');
      if (!this.lote && idLote) {
        try {
          this.lote = (await this.service.listarPorId(idLote)) as ILoteTabla;
        } catch (error) {
          this.helper.notifError(error);
        }
      }
      const datosKMZ: {
        coords: any;
        nombre: string;
      } = this.paramsService.get('loteDesdeKMZ') as {
        coords: ICoordenadas[];
        nombre: string;
      };
      if (datosKMZ) {
        console.log('datosKMZ', datosKMZ);

        this.lote = {
          nombre: datosKMZ.nombre,
          ubicacion: {
            geojson: {
              type: 'Polygon',
              coordinates: datosKMZ.coords,
            },
          },
        };
        this.paramsService.set('loteDesdeKMZ', null);
      }

      this.titulo = this.lote
        ? () => this.translate.instant(`Editar lote`)
        : () => this.translate.instant('Crear lote');
      this.createForm();
      await Promise.all([
        this.cargarListadoInicial('establecimientos', () => this.listarEstablecimientos()),
        this.cargarListadoInicial('sondas de suelo legacy', () => this.listarSondasSuelo()),
        this.cargarListadoInicial('dispositivos', () => this.listarDispositivos()),
      ]);

      this.sincronizarDesdeEstablecimiento();
      this.cambioSondaSuelo();
      this.onDispositivosChange(false);
      console.log('form', this.form?.value);
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.establecimientos$?.unsubscribe();
    this.sondasSuelo$?.unsubscribe();
    this.dispositivos$?.unsubscribe();
  }
}
