import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import {
  ICoordenadas,
  ICreateLote,
  IDepartamento,
  IDispositivo,
  IEstablecimiento,
  IEstacion,
  IFilter,
  IGeoJSONPoint,
  IGeoJSONPolygon,
  IListado,
  IPopulate,
  IQueryParam,
  IProvincia,
  ISuelo,
  ISueloReferencia,
  TTexturaSuelo,
  TTipoContenidoP,
  TTipoDepositoN,
  TTipoDrenaje,
  TTipoErosionEscorrentiaPendiente,
} from 'modelos/src';
import { Subscription } from 'rxjs';
import { MapDrawComponent } from '../../../../auxiliares/componentes/map-draw/map-draw.component';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ILoteTabla } from '../listado-lotes/listado-lotes.component';

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
  public departamentos: IDepartamento[] = [];
  public departamentos$?: Subscription;
  public provincias: IProvincia[] = [];
  public provincias$?: Subscription;
  public sondasSuelo: IEstacion[] = [];
  public sondasSuelo$?: Subscription;
  public dispositivos: IDispositivo[] = [];
  public dispositivos$?: Subscription;

  public centroMapa?: IGeoJSONPoint;

  public distanciaSonda?: string;
  public sueloIntaLoading = false;
  public sueloIntaInfo?: any;

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
  get departamentoSeleccionado(): IDepartamento | undefined {
    const idDepartamento = this.form?.get('idDepartamento')?.value;
    return this.departamentos.find((departamento) => departamento._id === idDepartamento);
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
    const ubicacion = this.establecimientoSeleccionado?.ubicacionAdministrativa;
    const partes = [ubicacion?.localidad, ubicacion?.partido, ubicacion?.provincia].filter(Boolean);
    if (partes.length) return partes.join(' / ');
    if (ubicacion?.direccion) return ubicacion.direccion;
    return 'Sin referencia administrativa cargada en el establecimiento';
  }
  get departamentoHeredadoTexto(): string | undefined {
    const departamento = this.departamentoSeleccionado;
    if (!departamento) return undefined;
    const provincia = this.nombreProvinciaDepartamento(departamento);
    return [provincia, departamento.nombre].filter(Boolean).join(' / ');
  }

  private nombreProvinciaDepartamento(departamento?: IDepartamento): string {
    if (!departamento) return '';
    if (departamento.provincia?.nombre) return departamento.provincia.nombre;
    if (departamento.idProvincia) {
      return this.provincias.find((provincia) => provincia._id === departamento.idProvincia)?.nombre || '';
    }
    return '';
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: LoteService,
    private helper: HelperService,
    private listado: ListadosService,
    private activatedRoute: ActivatedRoute
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
    this.suelos.push(this.agregarSueloFormGroup(this.sueloNuevoSugerido()));
  }
  public borrarSuelo(i: number) {
    this.suelos.removeAt(i);
  }
  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.lote?.nombre, Validators.required),
      idEstablecimiento: new FormControl(this.lote?.idEstablecimiento, Validators.required),
      idDepartamento: new FormControl(this.lote?.idDepartamento),
      idSondaSuelo: new FormControl(this.lote?.idSondaSuelo),
      idsDispositivo: new FormControl(this.lote?.idsDispositivo || []),
      sueloReferencia: new FormControl(this.lote?.sueloReferencia),
      tipoSueloManual: new FormControl(this.texturaInicialLote()),
      capacidadDeCampo: new FormControl(this.lote?.capacidadDeCampo),
      puntoMarchitez: new FormControl(this.lote?.puntoMarchitez),
      capacidadDeRiego: new FormControl(this.lote?.capacidadDeRiego),
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
    this.sincronizarDesdeEstablecimiento(true);
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

  public onDispositivosChange(): void {
    const lanza = this.lanzaSueloSeleccionada;
    if (!lanza) return;
    if (this.debeAutocompletarCapasDesdeLanza()) {
      this.prepararCapasDesdeLanza(false);
    }
  }

  public cambioTipoSueloManual(aplicarValores = true): void {
    if (!this.form) return;
    const textura = (this.form.get('tipoSueloManual')?.value || 'Franco') as TTexturaSuelo;
    const agua = this.capacidadPorTextura(textura);

    const capacidadActual = this.form.get('capacidadDeCampo')?.value;
    const marchitezActual = this.form.get('puntoMarchitez')?.value;
    const capacidadDeCampo = aplicarValores || this.esValorVacio(capacidadActual) ? agua.capacidadDeCampo : capacidadActual;
    const puntoMarchitez = aplicarValores || this.esValorVacio(marchitezActual) ? agua.puntoMarchitez : marchitezActual;

    this.form.patchValue(
      {
        capacidadDeCampo,
        puntoMarchitez,
        texturaLixiviacion: textura,
        texturaEscorrentia: textura,
      },
      { emitEvent: false },
    );

    this.sincronizarSueloManualEnCapas();
  }

  public prepararCapasDesdeLanza(forzar = true): void {
    const lanza = this.lanzaSueloSeleccionada;
    const profundidades = this.profundidadesLanza(lanza);
    if (!lanza || !profundidades.length || !this.suelos) {
      this.helper.notifWarn('No pude detectar capas de medicion en la lanza seleccionada.');
      return;
    }

    const textura = this.texturaPrincipalLote();
    const agua = this.capacidadPorTextura(textura);

    if (forzar) {
      this.suelos.clear();
    }

    for (let i = 0; i < profundidades.length; i++) {
      if (!this.suelos.at(i)) {
        this.suelos.push(
          this.agregarSueloFormGroup({
            numeroDeSensor: i + 1,
            profundidad: profundidades[i],
            textura,
            hayRaices: i < 6,
            capacidadDeCampo: agua.capacidadDeCampo,
            puntoMarchitez: agua.puntoMarchitez,
          }),
        );
        continue;
      }

      const group = this.suelos.at(i) as FormGroup;
      const patch: Partial<ISuelo> = {};
      if (forzar || this.esValorVacio(group.get('numeroDeSensor')?.value)) patch.numeroDeSensor = i + 1;
      if (forzar || this.esValorVacio(group.get('profundidad')?.value)) patch.profundidad = profundidades[i];
      if (forzar || this.esValorVacio(group.get('textura')?.value)) patch.textura = textura;
      if (forzar || this.esValorVacio(group.get('capacidadDeCampo')?.value)) patch.capacidadDeCampo = agua.capacidadDeCampo;
      if (forzar || this.esValorVacio(group.get('puntoMarchitez')?.value)) patch.puntoMarchitez = agua.puntoMarchitez;
      if (forzar || this.esValorVacio(group.get('hayRaices')?.value)) patch.hayRaices = i < 6;
      group.patchValue(patch);
    }

    this.suelos.markAsDirty();
    this.helper.notifSuccess(`${profundidades.length} capas de suelo preparadas desde la lanza seleccionada.`);
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

      if (sugerencias.suelos?.length) {
        this.suelos.clear();
        for (const suelo of sugerencias.suelos) {
          this.suelos.push(this.agregarSueloFormGroup(suelo));
        }
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

  private texturaPrincipalLote(): TTexturaSuelo {
    const manual = this.form?.get('tipoSueloManual')?.value as TTexturaSuelo | undefined;
    if (manual) return manual;

    const existente = (this.suelos?.controls || [])
      .map((control) => control.get('textura')?.value as TTexturaSuelo | undefined)
      .find(Boolean);
    if (existente) return existente;

    const desdeHuella = (this.form?.get('texturaLixiviacion')?.value ||
      this.form?.get('texturaEscorrentia')?.value) as TTexturaSuelo | undefined;
    if (desdeHuella) return desdeHuella;

    return this.texturaDesdeTexto(this.sueloReferenciaActual?.texturaSuperficial || this.sueloReferenciaActual?.texturaSubsuelo);
  }

  private texturaInicialLote(): TTexturaSuelo {
    const desdePerfil = this.lote?.suelos?.map((suelo) => suelo.textura).find(Boolean) as TTexturaSuelo | undefined;
    const desdeHuella = (this.lote?.texturaLixiviacion || this.lote?.texturaEscorrentia) as TTexturaSuelo | undefined;
    const desdeReferencia = this.texturaDesdeTexto(
      this.lote?.sueloReferencia?.texturaSuperficial || this.lote?.sueloReferencia?.texturaSubsuelo,
    );
    return desdePerfil || desdeHuella || desdeReferencia || 'Franco';
  }

  private sincronizarSueloManualEnCapas(): void {
    if (!this.form || !this.suelos) return;

    const textura = (this.form.get('tipoSueloManual')?.value || 'Franco') as TTexturaSuelo;
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
        }),
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
        { emitEvent: false },
      );
    }
  }

  private texturaDesdeTexto(value?: string): TTexturaSuelo {
    const texto = this.normalizarTexto(value);
    if (texto.includes('lim') && texto.includes('franco')) return 'Franco limoso';
    if (texto.includes('lim')) return 'Limoso';
    if (texto.includes('aren') && texto.includes('franco')) return 'Franco arenoso';
    if (texto.includes('aren')) return 'Arenoso';
    if (texto.includes('arcill') && texto.includes('franco')) return 'Franco arcilloso';
    if (texto.includes('arcill')) return 'Arcilloso';
    return 'Franco';
  }

  private capacidadPorTextura(textura: TTexturaSuelo): Pick<ISuelo, 'capacidadDeCampo' | 'puntoMarchitez'> {
    const valores: Record<TTexturaSuelo, Pick<ISuelo, 'capacidadDeCampo' | 'puntoMarchitez'>> = {
      Arcilloso: { capacidadDeCampo: 40, puntoMarchitez: 22 },
      'Franco arcilloso': { capacidadDeCampo: 35, puntoMarchitez: 18 },
      Franco: { capacidadDeCampo: 30, puntoMarchitez: 14 },
      'Franco limoso': { capacidadDeCampo: 32, puntoMarchitez: 15 },
      Limoso: { capacidadDeCampo: 31, puntoMarchitez: 13 },
      'Franco arenoso': { capacidadDeCampo: 22, puntoMarchitez: 10 },
      Arenoso: { capacidadDeCampo: 14, puntoMarchitez: 6 },
    };
    return valores[textura];
  }

  private textoDispositivo(dispositivo: IDispositivo): string {
    return this.normalizarTexto([
      dispositivo.nombre,
      dispositivo.tipo,
      dispositivo.deveui,
      ...(dispositivo.sensores || []),
    ].join(' '));
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
    this.sincronizarSueloManualEnCapas();
    this.sincronizarDesdeEstablecimiento(false);
    const data: ICreateLote = this.form?.value;
    delete (data as any).tipoSueloManual;
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

  private sincronizarDesdeEstablecimiento(forzarDepartamento = false): void {
    const establecimiento = this.establecimientoSeleccionado;
    if (!establecimiento || !this.form) return;
    this.centrarMapaDesdeEstablecimiento(establecimiento);
    this.sincronizarDepartamentoDesdeEstablecimiento(establecimiento, forzarDepartamento);
  }

  private sincronizarDepartamentoDesdeEstablecimiento(
    establecimiento?: IEstablecimiento,
    forzarDepartamento = false,
  ): IDepartamento | undefined {
    const control = this.form?.get('idDepartamento');
    if (!control || (!forzarDepartamento && control.value)) return this.departamentoSeleccionado;

    const ubicacion = establecimiento?.ubicacionAdministrativa;
    if (!ubicacion) {
      if (forzarDepartamento) control.setValue(undefined);
      return undefined;
    }

    const provincia = this.normalizarTexto(ubicacion.provincia);
    const candidatos = [ubicacion.partido, ubicacion.localidad]
      .map((value) => this.normalizarTexto(value))
      .filter(Boolean);

    if (!candidatos.length && !provincia) return;

    const departamento = this.departamentos.find((item) => {
      const nombreDepartamento = this.normalizarTexto(item.nombre);
      const nombreProvincia = this.normalizarTexto(this.nombreProvinciaDepartamento(item));
      const coincideProvincia = !provincia || nombreProvincia === provincia || nombreProvincia.includes(provincia);
      const coincideDepartamento =
        !candidatos.length ||
        candidatos.some((candidato) => nombreDepartamento === candidato || nombreDepartamento.includes(candidato));
      return coincideProvincia && coincideDepartamento;
    });

    if (departamento?._id) {
      control.setValue(departamento._id);
      control.markAsDirty();
    } else if (forzarDepartamento) {
      control.setValue(undefined);
    }
    return departamento;
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
    const administrativa = establecimiento?.ubicacionAdministrativa?.coordenadas;
    if (this.coordenadasValidas(administrativa)) return administrativa;

    const centroGuardado = establecimiento?.ubicacion?.find((ubicacion) => this.coordenadasValidas(ubicacion.centro))?.centro;
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
          if (!finalizada) console.warn(`${nombre} no respondio antes de ${timeoutMs} ms; la pantalla queda operativa.`);
          resolve();
        }, timeoutMs),
      ),
    ]);
  }

  private hidratarProvinciasDepartamentos(): void {
    if (!this.departamentos.length || !this.provincias.length) return;
    const provinciasPorId = new Map(
      this.provincias.filter((provincia) => provincia._id).map((provincia) => [provincia._id!, provincia]),
    );

    this.departamentos = this.departamentos.map((departamento) => {
      if (departamento.provincia?.nombre || !departamento.idProvincia) return departamento;
      const provincia = provinciasPorId.get(departamento.idProvincia);
      return provincia ? { ...departamento, provincia } : departamento;
    });
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
        this.sincronizarDesdeEstablecimiento(false);
        console.log(`listado de establecimientos`, data);
      });
    await this.listado.getLastValue('establecimientos', queryParams);
  }
  private async listarDepartamentos(): Promise<void> {
    const populate: IPopulate = {
      path: 'provincia',
      select: 'nombre',
    };
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.departamentos$?.unsubscribe();
    this.departamentos$ = this.listado
      .subscribe<IListado<IDepartamento>>('departamentos', queryParams)
      .subscribe(async (data) => {
        this.departamentos = data.datos;
        this.hidratarProvinciasDepartamentos();
        this.sincronizarDesdeEstablecimiento(false);
        console.log(`listado de departamentos`, data);
      });
    await this.listado.getLastValue('departamentos', queryParams);
  }

  private async listarProvinciasDb(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      select: 'nombre ubicacion',
    };

    this.provincias$?.unsubscribe();
    this.provincias$ = this.listado
      .subscribe<IListado<IProvincia>>('provincias', queryParams)
      .subscribe(async (data) => {
        this.provincias = data.datos;
        this.hidratarProvinciasDepartamentos();
        this.sincronizarDesdeEstablecimiento(false);
        console.log(`listado de provincias`, data);
      });
    void this.listado.getLastValue('provincias', queryParams).catch((error) => {
      console.warn('No se pudieron cargar provincias internas.', error);
    });
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

      this.titulo = this.lote ? () => this.translate.instant(`Editar lote`) : () => this.translate.instant('Crear lote');
      this.createForm();
      this.cambioTipoSueloManual(false);
      void this.listarProvinciasDb();

      await Promise.all([
        this.cargarListadoInicial('establecimientos', () => this.listarEstablecimientos()),
        this.cargarListadoInicial('departamentos', () => this.listarDepartamentos()),
        this.cargarListadoInicial('sondas de suelo legacy', () => this.listarSondasSuelo()),
        this.cargarListadoInicial('dispositivos', () => this.listarDispositivos()),
      ]);

      this.hidratarProvinciasDepartamentos();
      this.sincronizarDesdeEstablecimiento(false);
      this.cambioSondaSuelo();
      this.onDispositivosChange();
      console.log('form', this.form?.value);
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.establecimientos$?.unsubscribe();
    this.departamentos$?.unsubscribe();
    this.provincias$?.unsubscribe();
    this.sondasSuelo$?.unsubscribe();
    this.dispositivos$?.unsubscribe();
  }
}
