import { Component, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  DireccionV2,
  ICoordenadas,
  ICreateEstablecimiento,
  IEstablecimiento,
  IGeoJSONPoint,
  IGeoJSONMultiPolygon,
  IGeoJSONPolygon,
  IListado,
  IProductor,
  IQueryParam,
  IUbicacion,
  IZonaGeografica,
} from 'modelos/src';
import { AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { FileSelectEvent } from 'primeng/fileupload';
import { Subscription } from 'rxjs';
import { MapDrawComponent } from '../../../../auxiliares/componentes/map-draw/map-draw.component';
import { PROVINCIAS_ARGENTINA_BASE } from '../../../../auxiliares/constantes/provincias-argentina';
import { EstablecimientoService } from '../../../../auxiliares/http/establecimiento.service';
import { GeoNodeService } from '../../../../auxiliares/http/geonode.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { IKmzPolygonImportado, KmlKmzImportService } from '../../../../auxiliares/servicios/kml-kmz-import.service';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-crear-editar-establecimientos',
  imports: [SharedModule, MapDrawComponent],
  templateUrl: './crear-editar-establecimientos.component.html',
  styleUrl: './crear-editar-establecimientos.component.scss',
})
export class CrearEditarEstablecimientosComponent implements OnDestroy {
  public loading = false;
  public establecimiento?: IEstablecimiento;
  public titulo?: () => string;
  public form?: FormGroup;
  public tabValue = 0;

  public multipolygon?: IGeoJSONMultiPolygon;
  public centroMapa?: IGeoJSONPoint;
  public provinciaBusqueda?: IZonaGeografica;
  public provinciasGeograficas: IZonaGeografica[] = PROVINCIAS_ARGENTINA_BASE;
  public ubicacionesSugeridas: IZonaGeografica[] = [];
  public busquedaUbicacion: string | IZonaGeografica = '';
  public ubicacionLoading = false;
  public ubicacionDetectada?: DireccionV2;
  public kmzImportando = false;
  public kmzNombreArchivo = '';
  public kmzPoligonos: IKmzPolygonImportado[] = [];
  public productores: IProductor[] = [];
  private productores$?: Subscription;

  public get requiereSeleccionProductor(): boolean {
    return (
      !this.establecimiento &&
      ['Admin', 'Asesor'].includes(this.helper.permiso?.nivel || '')
    );
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: EstablecimientoService,
    public helper: HelperService,
    private listado: ListadosService,
    private geonode: GeoNodeService,
    private kmlKmzImport: KmlKmzImportService
  ) {}

  // FORMULARIO
  private initMultipolygon() {
    const mp: IGeoJSONMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [],
    };
    if (this.establecimiento?.ubicacion?.length) {
      for (const u of this.establecimiento.ubicacion) {
        if (u.geojson?.coordinates) mp.coordinates?.push(u.geojson.coordinates);
      }
    }
    this.multipolygon = mp;
  }

  private createForm(): void {
    this.form = new FormGroup({
      nombre: new FormControl(this.establecimiento?.nombre, Validators.required),
      idProductor: new FormControl(
        this.establecimiento?.idProductor,
        this.requiereSeleccionProductor ? Validators.required : [],
      ),
    });
  }

  public onMultipoligonChange(mp: IGeoJSONMultiPolygon) {
    const multi: IGeoJSONMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [],
    };
    if (!mp.coordinates?.length) return;
    for (const p of mp.coordinates) {
      multi.coordinates?.push(p);
    }
    this.multipolygon = multi;
  }

  // UBICACION

  public async buscarUbicaciones(event: AutoCompleteCompleteEvent): Promise<void> {
    const query = `${event.query || ''}`.trim();
    if (query.length < 3) {
      this.ubicacionesSugeridas = [];
      return;
    }

    this.ubicacionesSugeridas = this.buscarProvinciasLocales(query);
    this.ubicacionLoading = true;
    try {
      const response = await this.valorConTimeout(
        'busqueda de ubicacion',
        this.geonode.zonas({
          text: query,
          provincia: this.provinciaBusqueda?.provincia,
        }),
        { resultados: [] },
        8000
      );
      this.ubicacionesSugeridas = this.combinarZonas(response.resultados || [], this.ubicacionesSugeridas);
    } catch (error) {
      console.warn('No se pudieron buscar ubicaciones para establecimiento.', error);
    } finally {
      this.ubicacionLoading = false;
    }
  }

  public async seleccionarUbicacionEvent(event: AutoCompleteSelectEvent): Promise<void> {
    await this.seleccionarUbicacion(event.value);
  }

  public async seleccionarUbicacion(direccion: string | IZonaGeografica): Promise<void> {
    if (typeof direccion === 'object' && direccion?.coordenadas) {
      this.aplicarZonaGeografica(direccion);
      return;
    }

    const texto =
      typeof direccion === 'object'
        ? `${direccion?.label || direccion?.localidad || direccion?.departamento || direccion?.provincia || ''}`.trim()
        : `${direccion || ''}`.trim();
    if (!texto) return;

    this.ubicacionLoading = true;
    try {
      const zonas = await this.valorConTimeout(
        'zonas geograficas',
        this.geonode.zonas({
          text: texto,
          provincia: this.provinciaBusqueda?.provincia,
        }),
        { resultados: [] },
        8000
      );
      const zona = zonas.resultados?.[0];
      if (zona?.coordenadas) {
        this.aplicarZonaGeografica(zona);
        return;
      }

      const coordenadas = await this.valorConTimeout<ICoordenadas | undefined>(
        'geocodificacion',
        this.geonode.geocode({ text: texto }),
        undefined,
        8000
      );
      if (!coordenadas || !Number.isFinite(coordenadas.lat) || !Number.isFinite(coordenadas.lng)) {
        this.helper.notifWarn('No se encontraron coordenadas para esa busqueda.');
        return;
      }

      this.centrarMapa(coordenadas);
      this.actualizarZonaOrientativa({
        direccion: texto,
        provincia: this.provinciaBusqueda?.provincia,
        coordenadas,
      });
      this.helper.notifSuccess('Zona centrada. Ahora podes dibujar el establecimiento.');
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.ubicacionLoading = false;
    }
  }

  private aplicarZonaGeografica(zona: IZonaGeografica): void {
    if (!zona.coordenadas) return;
    this.busquedaUbicacion = zona;
    this.sincronizarProvinciaBusqueda(zona.provincia);
    this.centrarMapa(zona.coordenadas);
    this.actualizarZonaOrientativa({
      localidad: zona.localidad,
      partido: zona.departamento,
      provincia: zona.provincia,
      direccion: zona.label,
      coordenadas: zona.coordenadas,
    });
    this.helper.notifSuccess(`${zona.label}. Zona centrada para dibujar el establecimiento.`);
  }

  private centrarMapa(coordenadas: ICoordenadas): void {
    this.centroMapa = {
      type: 'Point',
      coordinates: [coordenadas.lng, coordenadas.lat],
    };
  }

  public get referenciaUbicacion(): string {
    const ubicacion = this.establecimiento?.ubicacionOficial;
    const jurisdiccion = ubicacion?.nivelAdministrativo2;
    const partes = [ubicacion?.localidadReferencia?.nombre, jurisdiccion?.nombre, ubicacion?.provincia?.nombre].filter(
      Boolean
    );
    if (partes.length) return partes.join(' / ');
    if (ubicacion?.estado === 'processing' || ubicacion?.estado === 'pending') {
      return 'Calculando ubicacion oficial';
    }
    if (ubicacion?.estado === 'failed') return 'Ubicacion oficial pendiente de reintento';
    return this.establecimiento ? 'Pendiente de resolucion oficial' : 'Se calculara automaticamente al guardar';
  }

  public get referenciaCoordenadas(): string | undefined {
    const punto = this.establecimiento?.ubicacionOficial?.puntoRepresentativo?.coordinates;
    const coordenadas = punto?.length ? { lng: punto[0], lat: punto[1] } : this.obtenerCentroMultipoligono();
    if (!Number.isFinite(coordenadas?.lat) || !Number.isFinite(coordenadas?.lng)) return undefined;
    return `${coordenadas!.lat.toFixed(5)}, ${coordenadas!.lng.toFixed(5)}`;
  }

  public get referenciaBusqueda(): string {
    const ubicacion = this.ubicacionDetectada;
    const partes = [ubicacion?.localidad, ubicacion?.partido, ubicacion?.provincia].filter(Boolean);
    return partes.join(' / ') || ubicacion?.direccion || 'Busca una zona para centrar el mapa';
  }

  public cambioProvinciaBusqueda(): void {
    if (!this.provinciaBusqueda) return;
    this.actualizarZonaOrientativa({
      provincia: this.provinciaBusqueda.provincia,
      direccion: this.provinciaBusqueda.label,
      coordenadas: this.provinciaBusqueda.coordenadas,
    });
    if (this.provinciaBusqueda.coordenadas) this.centrarMapa(this.provinciaBusqueda.coordenadas);
  }

  private zonaOrientativaActual(): DireccionV2 | undefined {
    return this.ubicacionDetectada;
  }

  private actualizarZonaOrientativa(ubicacion?: DireccionV2): void {
    if (!ubicacion) return;
    const tieneDatos =
      !!ubicacion.localidad ||
      !!ubicacion.partido ||
      !!ubicacion.provincia ||
      !!ubicacion.direccion ||
      !!ubicacion.coordenadas;
    if (!tieneDatos) return;
    this.ubicacionDetectada = ubicacion;
  }

  private inicializarMapaDesdeUbicacion(): void {
    const oficial = this.establecimiento?.ubicacionOficial;
    const coordenadas = oficial?.puntoRepresentativo?.coordinates;
    if (coordenadas?.length) {
      this.centrarMapa({ lng: coordenadas[0], lat: coordenadas[1] });
      this.sincronizarProvinciaBusqueda(oficial?.provincia?.nombre);
      return;
    }
    const legado =
      this.establecimiento?.ubicacionAdministrativaLegada?.valor || this.establecimiento?.ubicacionAdministrativa;
    if (legado?.coordenadas) this.centrarMapa(legado.coordenadas);
  }

  private obtenerCentroMultipoligono(): ICoordenadas | undefined {
    const primerPoligono = this.multipolygon?.coordinates?.[0];
    if (!primerPoligono?.length) return undefined;
    const geojson: IGeoJSONPolygon = {
      type: 'Polygon',
      coordinates: primerPoligono as [[number, number][]],
    };
    const centro = this.helper.calcularCentroide(geojson);
    if (!centro?.length) return undefined;
    return { lat: centro[1], lng: centro[0] };
  }

  private async listarProvinciasGeograficas(): Promise<void> {
    this.provinciasGeograficas = PROVINCIAS_ARGENTINA_BASE;
    try {
      const response = await this.valorConTimeout(
        'provincias geograficas',
        this.geonode.provincias(),
        { resultados: [] },
        8000
      );
      this.provinciasGeograficas = this.combinarZonas(response.resultados || [], PROVINCIAS_ARGENTINA_BASE);
    } catch (error) {
      console.warn('No se pudieron cargar provincias geograficas.', error);
      this.provinciasGeograficas = PROVINCIAS_ARGENTINA_BASE;
    }
  }

  private buscarProvinciasLocales(query: string): IZonaGeografica[] {
    const texto = this.normalizarTexto(query);
    const provinciaFiltro = this.normalizarTexto(this.provinciaBusqueda?.provincia);
    const resultados = this.provinciasGeograficas.filter((zona) => {
      const valor = this.normalizarTexto([zona.label, zona.provincia].join(' '));
      const coincideProvincia = !provinciaFiltro || this.normalizarTexto(zona.provincia) === provinciaFiltro;
      return coincideProvincia && valor.includes(texto);
    });
    resultados.push({
      id: `buscar-${texto}`,
      tipo: 'direccion',
      label: query,
      provincia: this.provinciaBusqueda?.provincia,
      fuente: 'Busqueda libre',
    });
    return this.combinarZonas(resultados).slice(0, 12);
  }

  private sincronizarProvinciaBusqueda(provincia?: string): void {
    if (!provincia) return;
    const normalizada = this.normalizarTexto(provincia);
    const encontrada = this.provinciasGeograficas.find((item) => this.normalizarTexto(item.provincia) === normalizada);
    if (encontrada) this.provinciaBusqueda = encontrada;
  }

  private combinarZonas(...grupos: IZonaGeografica[][]): IZonaGeografica[] {
    const zonas = new Map<string, IZonaGeografica>();
    for (const grupo of grupos) {
      for (const zona of grupo || []) {
        const key = this.normalizarTexto(
          [zona.tipo, zona.provincia, zona.departamento, zona.localidad, zona.label].filter(Boolean).join('|')
        );
        if (key && !zonas.has(key)) zonas.set(key, zona);
      }
    }
    return Array.from(zonas.values());
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

  private async valorConTimeout<T>(nombre: string, tarea: Promise<T>, fallback: T, timeoutMs = 10000): Promise<T> {
    let finalizada = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const tareaSegura = tarea
      .then((value) => {
        finalizada = true;
        return value;
      })
      .catch((error) => {
        finalizada = true;
        console.warn(`No se pudo cargar ${nombre}.`, error);
        return fallback;
      });
    const timeout = new Promise<T>((resolve) => {
      timeoutId = setTimeout(() => {
        if (!finalizada) console.warn(`${nombre} no respondio antes de ${timeoutMs} ms; sigo con respaldo local.`);
        resolve(fallback);
      }, timeoutMs);
    });
    const resultado = await Promise.race([tareaSegura, timeout]);
    if (timeoutId) clearTimeout(timeoutId);
    return resultado;
  }

  // ACCIONES

  private getData() {
    const data: ICreateEstablecimiento = { ...this.form?.value };

    const ubicaciones: IUbicacion[] = [];
    if (this.multipolygon?.coordinates?.length) {
      for (const p of this.multipolygon.coordinates) {
        const geojson: IGeoJSONPolygon = {
          type: 'Polygon',
          coordinates: p as [[number, number][]],
        };
        const centro = this.helper.calcularCentroide(geojson);
        const ubicacion: IUbicacion = {
          geojson,
          centro: { lat: centro[1], lng: centro[0] },
          superficie: this.helper.calcularAreaHectareas(geojson),
        };
        ubicaciones.push(ubicacion);
      }
      data.ubicacion = ubicaciones;
    }
    return data;
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data = this.getData();
      if (this.establecimiento?._id) {
        await this.service.editar(this.establecimiento._id, data);

        // Solo actualiza el item en cache
        this.listado.patchEntityItem('establecimientos', {
          _id: this.establecimiento._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);

        // Solo actualiza el item en cache
        this.listado.createEntityItem('establecimientos', created);

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
        this.helper.notifSuccess('Poligono importado. Revisa el mapa y guarda el establecimiento.');
      } else {
        this.tabValue = 1;
        this.helper.notifSuccess(`${this.kmzPoligonos.length} poligonos importados. Podes usarlos o crearlos en lote.`);
      }
    } catch (error) {
      this.helper.notifError(error);
      this.kmzPoligonos = [];
    } finally {
      this.kmzImportando = false;
    }
  }

  public aplicarPoligonoImportado(poligono: IKmzPolygonImportado): void {
    if (!poligono?.geojson?.coordinates?.length) return;
    this.multipolygon = {
      type: 'MultiPolygon',
      coordinates: [poligono.geojson.coordinates],
    };
    if (!this.form?.get('nombre')?.value) {
      this.form?.get('nombre')?.setValue(poligono.nombre);
    }
    this.centroMapa = {
      type: 'Point',
      coordinates: [poligono.centro.lng, poligono.centro.lat],
    };
    const actual = this.zonaOrientativaActual();
    this.actualizarZonaOrientativa({
      ...actual,
      direccion: actual?.direccion || `Importado desde ${this.kmzNombreArchivo || 'KML/KMZ'}`,
      coordenadas: actual?.coordenadas || poligono.centro,
    });
    this.tabValue = 1;
  }

  public async crearEstablecimientosImportados(): Promise<void> {
    if (!this.kmzPoligonos.length) return;
    const cantidad = this.kmzPoligonos.length;
    const confirmar = window.confirm(
      `Crear ${cantidad} establecimiento${cantidad === 1 ? '' : 's'} desde el archivo importado?`
    );
    if (!confirmar) return;

    this.loading = true;
    let creados = 0;
    let errores = 0;
    try {
      for (const poligono of this.kmzPoligonos) {
        const data: ICreateEstablecimiento = {
          nombre: poligono.nombre,
          idProductor: this.form?.get('idProductor')?.value,
          ubicacion: [
            {
              geojson: poligono.geojson,
              centro: poligono.centro,
              superficie: poligono.superficie,
            },
          ],
        };

        try {
          const created = await this.service.crear(data);
          this.listado.createEntityItem('establecimientos', created);
          creados += 1;
        } catch (error) {
          errores += 1;
          console.error('No se pudo crear establecimiento importado.', error);
        }
      }

      if (creados) {
        this.helper.notifSuccess(
          `${creados} establecimiento${creados === 1 ? '' : 's'} creado${creados === 1 ? '' : 's'} desde KMZ/KML.`
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

  //

  private async listarProductores(): Promise<void> {
    if (!this.requiereSeleccionProductor) return;
    const query: IQueryParam = { page: 0, limit: 0, sort: 'nombre' };
    this.productores$?.unsubscribe();
    this.productores$ = this.listado
      .subscribe<IListado<IProductor>>('productors', query)
      .subscribe((response) => {
        this.productores = response.datos || [];
      });
    await this.listado.getLastValue('productors', query);
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.establecimiento = this.paramsService.get('editEstablecimiento');
    const datosKMZ: {
      coords: any;
      nombre: string;
    } = this.paramsService.get('establecimientoDesdeKMZ') as {
      coords: ICoordenadas[];
      nombre: string;
    };
    if (datosKMZ) {
      console.log('datosKMZ', datosKMZ);
      const ubicaciones: IUbicacion[] = [
        {
          geojson: {
            type: 'Polygon',
            coordinates: datosKMZ.coords,
          },
        },
      ];

      this.establecimiento = {
        nombre: datosKMZ.nombre,
        ubicacion: ubicaciones,
      };
      this.paramsService.set('establecimientoDesdeKMZ', null);
    }
    if (this.establecimiento) {
      console.log('edit', this.establecimiento);
    }
    this.titulo = this.establecimiento
      ? () => this.translate.instant(`Editar establecimiento`)
      : () => this.translate.instant('Crear establecimiento');
    this.initMultipolygon();
    this.createForm();
    await Promise.all([
      this.listarProvinciasGeograficas(),
      this.listarProductores(),
    ]);
    this.inicializarMapaDesdeUbicacion();
    this.loading = false;
  }

  ngOnDestroy(): void {
    this.productores$?.unsubscribe();
  }
}
