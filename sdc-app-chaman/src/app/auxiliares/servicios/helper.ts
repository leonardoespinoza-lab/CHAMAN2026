import { Clipboard } from '@angular/cdk/clipboard';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { TranslateService } from '@ngx-translate/core';
import {
  Cultivo,
  ICrono,
  IEstablecimiento,
  IEtapasCebada,
  IEtapasMaiz,
  IEtapasSoja,
  IEtapasTrigo,
  IGeoJSONPoint,
  IGeoJSONPolygon,
  IPermiso,
  IQueryParam,
  ISiembra,
  IToken,
  ModuloPermiso,
} from 'modelos/src';
import { FilterMetadata, MessageService } from 'primeng/api';
import { TableLazyLoadEvent } from 'primeng/table';
import { Observable, map, shareReplay } from 'rxjs';
import { ILoteTabla } from '../../main/modulo-productor/lotes/listado-lotes/listado-lotes.component';

@Injectable({
  providedIn: 'root',
})
export class HelperService {
  public isHandset$: Observable<boolean>;
  public isWide$: Observable<boolean>;
  public isDesktop$: Observable<boolean>;

  constructor(
    private breakpointObserver: BreakpointObserver,
    private messageService: MessageService,
    private translate: TranslateService,
    private clipboard: Clipboard
  ) {
    this.isHandset$ = this.breakpointObserver.observe(Breakpoints.Handset).pipe(
      map((result) => result.matches),
      shareReplay()
    );
    this.isWide$ = this.breakpointObserver.observe('(min-aspect-ratio: 1/1)').pipe(
      map((result) => result.matches),
      shareReplay()
    ); // True si es más ancho que alto

    // Nuevo observable que detecta escritorio real (pantalla grande + no táctil)
    this.isDesktop$ = this.breakpointObserver.observe('(min-width: 1024px)').pipe(
      map((result) => result.matches && !this.isTouchDevice()),
      shareReplay()
    );
  }
  // PAGINACION
  // *************************************** //
  public pageSizeOptions = [5, 10, 15, 25, 50, 100];
  public getPageSize(tabla: string): number {
    return +(localStorage.getItem(`pageSize_${tabla}`) || 10);
  }
  public setPageSize(tabla: string, pageSize: number) {
    localStorage.setItem(`pageSize_${tabla}`, pageSize.toString());
  }

  // TABLAS
  // *************************************** //
  private buildMongoFilter(
    filters?: { [s: string]: FilterMetadata | FilterMetadata[] | undefined },
    camposBusquedaGlobal?: string[]
  ) {
    const generalAndConditions: any[] = [];

    for (const field in filters) {
      const filter = filters[field];

      if (!filter) continue;

      // Si el filtro es un array, procesar cada uno
      const filterArray = Array.isArray(filter) ? filter : [filter];

      const orConditions: any[] = [];
      const andConditions: any[] = [];

      filterArray.forEach((f) => {
        if (f.value === undefined || f.value === null) return; // Ignorar filtros sin valor
        if (Array.isArray(f.value) && f.value.length === 0) return; // Ignorar arrays vacíos

        const value = f.value;
        const matchMode = f.matchMode;

        let condition;
        if (field === 'global' && camposBusquedaGlobal?.length && camposBusquedaGlobal.length > 0) {
          // Filtro global: generar $or para los campos especificados
          condition = {
            $or: camposBusquedaGlobal.map((campo) => ({
              [campo]: { $regex: value, $options: 'i' },
            })),
          };
        } else {
          // Procesar el filtro normal
          switch (matchMode) {
            case 'startsWith':
              condition = { [field]: { $regex: `^${value}`, $options: 'i' } };
              break;
            case 'contains':
              condition = { [field]: { $regex: value, $options: 'i' } };
              break;
            case 'endsWith':
              condition = { [field]: { $regex: `${value}$`, $options: 'i' } };
              break;
            case 'equals':
              condition = { [field]: value };
              break;
            case 'notEquals':
              condition = { [field]: { $ne: value } };
              break;
            case 'in':
              condition = { [field]: { $in: Array.isArray(value) ? value : [value] } };
              break;
            case 'lt':
              condition = { [field]: { $lt: value } };
              break;
            case 'lte':
              condition = { [field]: { $lte: value } };
              break;
            case 'gt':
              condition = { [field]: { $gt: value } };
              break;
            case 'gte':
              condition = { [field]: { $gte: value } };
              break;
            case 'dateIs':
              condition = {
                [field]: {
                  $gte: new Date(value).setHours(0, 0, 0, 0),
                  $lt: new Date(value).setHours(24, 0, 0, 0),
                },
              };
              break;
            case 'dateBefore':
              condition = { [field]: { $lt: new Date(value) } };
              break;
            case 'dateAfter':
              condition = { [field]: { $gt: new Date(value) } };
              break;
            case 'dateIsNot':
              condition = {
                [field]: {
                  $not: {
                    $gte: new Date(value).setHours(0, 0, 0, 0),
                    $lt: new Date(value).setHours(24, 0, 0, 0),
                  },
                },
              };
              break;
            case 'notContains':
              condition = { [field]: { $regex: `^((?!${value}).)*$`, $options: 'i' } };
              break;
            default:
              throw new Error(`Unsupported matchMode: ${matchMode}`);
          }
        }

        // Clasificar condiciones según el operador
        if (f.operator === 'and') {
          andConditions.push(condition);
        } else {
          // Por defecto, el operador es 'or'
          orConditions.push(condition);
        }
      });

      // Crear la condición final para el campo
      if (orConditions.length > 0) {
        generalAndConditions.push({ $or: orConditions });
      }
      if (andConditions.length > 0) {
        generalAndConditions.push({ $and: andConditions });
      }
    }

    // Combinar todas las condiciones en un $and general
    return { $and: generalAndConditions };
  }
  private buildMongoSort(sortField?: string | string[] | null, sortOrder?: number | null) {
    if (!sortField || !sortOrder) return {};
    const sort: any = {};
    if (Array.isArray(sortField)) {
      sortField.forEach((field) => {
        sort[field] = sortOrder;
      });
    } else {
      sort[sortField] = sortOrder;
    }
    return sort;
  }
  public buildMongoQuery(event: TableLazyLoadEvent, camposBusquedaGlobal?: string[]) {
    const filter = this.buildMongoFilter(event.filters, camposBusquedaGlobal);
    const sort = this.buildMongoSort(event.sortField, event.sortOrder);

    const query: IQueryParam = {
      filter: JSON.stringify(filter),
      sort: JSON.stringify(sort),
      limit: event.rows || 10,
      page: event.first! / (event.rows || 10),
    };

    return query;
  }

  // TOATS
  // *************************************** //
  public notifError(error: any, title?: string) {
    title = title || this.translate.instant('Error');

    console.error(error);
    let detail = '';

    if (typeof error === 'string') {
      detail = error;
    } else {
      detail = error?.error?.message || error?.message || 'Error desconocido, ver logs';
    }

    this.messageService.add({ severity: 'error', summary: title, detail });
  }
  public notifSuccess(detail: string, title?: string) {
    title = title || this.translate.instant('Operación correcta');
    this.messageService.add({ severity: 'success', summary: title, detail });
  }
  public notifWarn(detail: string, title?: string) {
    title = title || this.translate.instant('Atención');
    this.messageService.add({ severity: 'warn', summary: title, detail });
  }

  // AUTH
  // *************************************** //
  get accessToken() {
    const token = this.token;
    return token?.accessToken;
  }
  get refreshToken() {
    const token = this.token;
    return token?.refreshToken;
  }
  get user() {
    const token = this.token;
    return token?.user;
  }
  get token(): IToken | null {
    const sessionToken = this.parseStoredToken(sessionStorage.getItem('token'));
    const localToken = this.parseStoredToken(localStorage.getItem('token'));

    if (sessionToken && localToken) {
      const usarSession = this.tokenTimestamp(sessionToken) >= this.tokenTimestamp(localToken);
      if (usarSession) {
        this.clearAuthStorage(localStorage);
        return sessionToken;
      }

      this.clearAuthStorage(sessionStorage);
      return localToken;
    }

    return sessionToken || localToken;
  }
  public setToken(token: IToken, remember = false) {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    if (remember) {
      localStorage.setItem('token', JSON.stringify(token));
    } else {
      sessionStorage.setItem('token', JSON.stringify(token));
    }
  }
  public removeToken() {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    localStorage.removeItem('permiso');
    sessionStorage.removeItem('permiso');
    localStorage.removeItem('numeroPermiso');
    sessionStorage.removeItem('numeroPermiso');
  }

  get permiso(): IPermiso | null {
    const permiso = sessionStorage.getItem('permiso') || localStorage.getItem('permiso');
    return permiso ? JSON.parse(permiso) : null;
  }
  public setPermiso(permiso: IPermiso, remember = true) {
    localStorage.removeItem('permiso');
    sessionStorage.removeItem('permiso');
    if (remember) {
      localStorage.setItem('permiso', JSON.stringify(permiso));
    } else {
      sessionStorage.setItem('permiso', JSON.stringify(permiso));
    }
  }
  public removePermiso() {
    localStorage.removeItem('permiso');
    sessionStorage.removeItem('permiso');
  }

  get numeroPermiso(): number | null {
    const numeroPermiso = sessionStorage.getItem('numeroPermiso') || localStorage.getItem('numeroPermiso');
    return numeroPermiso ? +numeroPermiso : null;
  }
  public setNumeroPermiso(numeroPermiso: number, remember = true) {
    localStorage.removeItem('numeroPermiso');
    sessionStorage.removeItem('numeroPermiso');
    if (remember) {
      localStorage.setItem('numeroPermiso', numeroPermiso.toString());
    } else {
      sessionStorage.setItem('numeroPermiso', numeroPermiso.toString());
    }
  }
  public removeNumeroPermiso() {
    localStorage.removeItem('numeroPermiso');
    sessionStorage.removeItem('numeroPermiso');
  }

  private parseStoredToken(raw: string | null): IToken | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private tokenTimestamp(token: IToken): number {
    const expiresAt = token.accessTokenExpiresAt ? new Date(token.accessTokenExpiresAt).getTime() : 0;
    return Number.isFinite(expiresAt) ? expiresAt : 0;
  }

  private clearAuthStorage(storage: Storage): void {
    storage.removeItem('token');
    storage.removeItem('permiso');
    storage.removeItem('numeroPermiso');
  }

  public puedeVerModulo(modulo: ModuloPermiso | string): boolean {
    const permiso = this.permiso;
    if (!permiso?.modulos) {
      return true;
    }
    return permiso.modulos[modulo as ModuloPermiso] !== false;
  }

  // COLORES
  // *************************************** //
  get darkTheme() {
    return false;
  }
  get isHandset() {
    return this.breakpointObserver.isMatched('(max-width: 599px)');
  }

  private isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
  public toggleTheme(): void {
    this.forceLightTheme();
  }

  public forceLightTheme(): void {
    const html = document.querySelector('html');
    html?.classList.remove('p-dark');
    localStorage.removeItem('dark');
  }
  public invertColor(color: string): string {
    if (color?.[0] === '#') {
      return this.esColorClaro(color) ? '#000000' : '#FFFFFF';
    }
    return this.darkTheme ? '#FFF' : '#000';
  }
  private esColorClaro(hexColor: string): boolean {
    // Elimina el símbolo '#' si está presente
    const color = hexColor.replace('#', '');

    // Convierte el color a valores RGB
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);

    // Calcula la luminosidad relativa
    const luminosidad = 0.299 * r + 0.587 * g + 0.114 * b;

    // Si la luminosidad es mayor a 186, el color es claro
    return luminosidad > 186;
  }
  public static hexToRgba(hex: string, opacity: number): string {
    // Elimina el símbolo '#' si está presente
    hex = hex.replace(/^#/, '');

    // Divide el valor HEX en partes de 2 caracteres
    let r = 0,
      g = 0,
      b = 0;

    if (hex.length === 3) {
      // Si el HEX es del tipo corto (#abc), lo expandimos a 6 caracteres (#aabbcc)
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      // Si el HEX ya tiene 6 caracteres
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }

    // Retorna el formato RGBA
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // UBICACION
  // *************************************** //
  public async getCurrentPosition(): Promise<IGeoJSONPoint> {
    const geojsonBase: IGeoJSONPoint = {
      coordinates: [-58.0128784, -35.5836812], // Coordenadas por defecto (Argentina)
      type: 'Point',
    };

    try {
      // Intentar usar Capacitor primero (para apps nativas)
      if (Capacitor.isNativePlatform()) {
        console.log('Usando Capacitor Geolocation (plataforma nativa)');

        // Verificar permisos
        const permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted') {
          const requestResult = await Geolocation.requestPermissions();
          if (requestResult.location !== 'granted') {
            console.warn('Permisos de geolocalización denegados en Capacitor');
            return geojsonBase;
          }
        }

        // Obtener posición con Capacitor
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });

        return {
          coordinates: [position.coords.longitude, position.coords.latitude],
          type: 'Point',
        };
      }

      // Fallback al navegador (para PWA/web)
      else if (navigator.geolocation) {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const geojson: IGeoJSONPoint = {
                coordinates: [position.coords.longitude, position.coords.latitude],
                type: 'Point',
              };
              resolve(geojson);
            },
            (error) => {
              console.error('Error obteniendo ubicación del navegador:', error);
              resolve(geojsonBase);
            },
            {
              timeout: 10000,
              enableHighAccuracy: true,
            }
          );
        });
      }

      // Si no hay soporte de geolocalización
      else {
        console.warn('Geolocalización no soportada');
        return geojsonBase;
      }
    } catch (error) {
      console.error('Error obteniendo ubicación:', error);
      return geojsonBase;
    }
  }

  /**
   * Obtiene las coordenadas del dispositivo para usar en búsquedas.
   * Si no se puede obtener la ubicación, retorna coordenadas por defecto de Argentina.
   * @param useDeviceLocation - Si true, intenta obtener la ubicación del dispositivo
   * @returns Promise<ICoordenadas> - Coordenadas en formato lat/lng
   */
  public async getSearchCoordinates(useDeviceLocation: boolean = true): Promise<{ lat: number; lng: number }> {
    if (!useDeviceLocation) {
      return { lat: -35.5836812, lng: -58.0128784 }; // Argentina por defecto
    }

    try {
      const position = await this.getCurrentPosition();
      if (position.coordinates && position.coordinates.length >= 2) {
        return {
          lat: position.coordinates[1], // latitude
          lng: position.coordinates[0], // longitude
        };
      } else {
        throw new Error('Coordenadas inválidas');
      }
    } catch (error) {
      console.warn('No se pudo obtener ubicación del dispositivo, usando ubicación por defecto:', error);
      return { lat: -35.5836812, lng: -58.0128784 }; // Argentina por defecto
    }
  }
  public calcularAreaHectareas(geojson: IGeoJSONPolygon): number {
    if (!geojson || geojson.type !== 'Polygon') {
      throw new Error('El GeoJSON proporcionado no es un polígono válido.');
    }

    const R = 6371000; // Radio de la Tierra en metros
    const coordinates = geojson?.coordinates?.[0]; // Asumimos un solo anillo

    if (coordinates?.length && coordinates?.length < 4) {
      throw new Error('Un polígono debe tener al menos 4 puntos (incluyendo el punto de cierre).');
    }

    let area = 0;

    // Convertir grados a radianes
    const toRadians = (deg: number) => (deg * Math.PI) / 180;

    // Calcular el área usando la fórmula esférica
    for (let i = 0; i < coordinates?.length! - 1; i++) {
      const [lon1, lat1] = coordinates![i];
      const [lon2, lat2] = coordinates![i + 1];

      const x1 = toRadians(lon1);
      const y1 = toRadians(lat1);
      const x2 = toRadians(lon2);
      const y2 = toRadians(lat2);

      area += (x2 - x1) * (2 + Math.sin(y1) + Math.sin(y2));
    }

    area = Math.abs((area * R ** 2) / 2); // Área en m²
    return area / 10_000; // Convertir a hectáreas
  }
  public calcularCentroide(geojson: IGeoJSONPolygon): [number, number] {
    if (!geojson || geojson.type !== 'Polygon') {
      throw new Error('El GeoJSON proporcionado no es un polígono válido.');
    }

    const coordinates = geojson.coordinates?.[0]; // Asumimos un solo anillo
    if (coordinates?.length && coordinates?.length < 3) {
      throw new Error('Un polígono debe tener al menos 3 puntos.');
    }

    let area = 0; // Área del polígono
    let cx = 0; // Coordenada X del centroide
    let cy = 0; // Coordenada Y del centroide

    // Calcular el área y las coordenadas del centroide
    for (let i = 0; i < coordinates!.length - 1; i++) {
      const [x1, y1] = coordinates![i];
      const [x2, y2] = coordinates![i + 1];

      const factor = x1 * y2 - x2 * y1;
      area += factor;
      cx += (x1 + x2) * factor;
      cy += (y1 + y2) * factor;
    }

    area *= 0.5;
    cx /= 6 * area;
    cy /= 6 * area;

    return [cx, cy];
  }
  public calcularDistancia(punto1: IGeoJSONPoint, punto2: IGeoJSONPoint): number {
    if (!punto1 || punto1.type !== 'Point') {
      throw new Error('El primer GeoJSON proporcionado no es un punto válido.');
    }
    if (!punto2 || punto2.type !== 'Point') {
      throw new Error('El segundo GeoJSON proporcionado no es un punto válido.');
    }

    const [lon1, lat1] = punto1.coordinates!;
    const [lon2, lat2] = punto2.coordinates!;

    const R = 6371000; // Radio de la Tierra en metros

    const toRadians = (deg: number) => (deg * Math.PI) / 180;

    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distancia en metros
  }
  public distanciaPuntoAPoligono(point: IGeoJSONPoint, polygon: IGeoJSONPolygon): number {
    if (!point || point.type !== 'Point') {
      throw new Error('El GeoJSON proporcionado no es un punto válido.');
    }
    if (!polygon || polygon.type !== 'Polygon' || !polygon.coordinates?.length) {
      throw new Error('El GeoJSON proporcionado no es un polígono válido.');
    }

    const [lon, lat] = point.coordinates!;
    const coordinates = polygon.coordinates[0]; // Asumimos un solo anillo

    let minDistance = Infinity;

    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];

      const distance = this.calcularDistancia(
        { type: 'Point', coordinates: [lon, lat] },
        { type: 'Point', coordinates: [(lon1 + lon2) / 2, (lat1 + lat2) / 2] }
      );

      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return minDistance;
  }
  public establecimientoMasCercano(point: IGeoJSONPoint, establecimientos: IEstablecimiento[]) {
    if (!point || point.type !== 'Point') {
      return;
    }
    if (!establecimientos) {
      return;
    }

    let minDistance = Infinity;
    let closestEstablecimiento: IEstablecimiento | undefined = undefined;

    for (const establecimiento of establecimientos) {
      if (!establecimiento.ubicacion?.length) {
        continue; // Saltar establecimientos sin ubicaciones
      }
      for (const ubicacion of establecimiento.ubicacion) {
        const geojson = ubicacion.geojson;
        if (!geojson) continue;
        const distance = this.distanciaPuntoAPoligono(point, geojson);
        if (distance < minDistance) {
          minDistance = distance;
          closestEstablecimiento = establecimiento;
        }
      }
    }

    return closestEstablecimiento;
  }

  // TRADUCCION
  // *************************************** //
  public translateCultivo(cultivo?: Cultivo): string {
    if (!cultivo) return '';
    switch (cultivo) {
      case 'Soja':
        return this.translate.instant('Soja');
      case 'Maiz':
        return this.translate.instant('Maíz');
      case 'Trigo':
        return this.translate.instant('Trigo');
      case 'Cebada':
        return this.translate.instant('Cebada');
      case 'Arveja':
        return this.translate.instant('Arveja');
      case 'Papa':
        return this.translate.instant('Papa');
      case 'Vid':
        return this.translate.instant('Vid');
      case 'Peral':
        return this.translate.instant('Peral');
      case 'Pecan':
        return this.translate.instant('Pecan');
      case 'Manzano':
        return this.translate.instant('Manzano');
    }
  }
  public translateCiclo(ciclo?: string): string {
    if (!ciclo) return '';
    switch (ciclo.toLowerCase()) {
      case 'corto':
        return this.translate.instant('Corto');
      case 'intermedio':
        return this.translate.instant('Intermedio');
      case 'intermedio-corto':
        return this.translate.instant('Intermedio-corto');
      case 'intermedio-largo':
        return this.translate.instant('Intermedio-largo');
      case 'largo':
        return this.translate.instant('Largo');
      default:
        return ciclo;
    }
  }

  // CRONO
  // *************************************** //
  private getNumeroEtapaTrigo(lote: ILoteTabla) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    const fecha = new Date().toISOString();
    if (!siembra?.fechaSiembra || !crono) return 0;

    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaActual = new Date(fecha);
    const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
    const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    const etapasTrigo = crono?.etapas as IEtapasTrigo;

    const etapa1 = etapasTrigo?.R0_R1!;
    const etapa2 = etapa1 + etapasTrigo?.R1_R2!;
    const etapa3 = etapa2 + etapasTrigo?.R2_R3!;
    const etapa4 = etapa3 + etapasTrigo?.R3_R4!;
    const etapa5 = etapa4 + etapasTrigo?.R4_R5!;
    const etapa6 = etapa5 + etapasTrigo?.R5_R6!;
    const etapa7 = etapa6 + etapasTrigo?.R6_R7!;

    if (diasTransucurridos < etapa1) {
      return 0;
    } else if (diasTransucurridos < etapa2) {
      return 1;
    } else if (diasTransucurridos < etapa3) {
      return 2;
    } else if (diasTransucurridos < etapa4) {
      return 3;
    } else if (diasTransucurridos < etapa5) {
      return 4;
    } else if (diasTransucurridos < etapa6) {
      return 5;
    } else if (diasTransucurridos < etapa7) {
      return 6;
    } else {
      return 7;
    }
  }
  private getNumeroEtapaSoja(lote: ILoteTabla) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    const fecha = new Date().toISOString();
    if (!siembra?.fechaSiembra || !crono) return 0;

    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaActual = new Date(fecha);
    const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
    const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    const etapasSoja = crono?.etapas as IEtapasSoja;

    const etapa1 = etapasSoja?.siembra_emergencia!;
    const etapa2 = etapa1 + etapasSoja?.emergencia_R1!;
    const etapa3 = etapa2 + etapasSoja?.R1_R3!;
    const etapa4 = etapa3 + etapasSoja?.R3_R5!;
    const etapa5 = etapa4 + etapasSoja?.R5_R7!;

    if (diasTransucurridos < etapa1) {
      return 0;
    } else if (diasTransucurridos < etapa2) {
      return 1;
    } else if (diasTransucurridos < etapa3) {
      return 2;
    } else if (diasTransucurridos < etapa4) {
      return 3;
    } else if (diasTransucurridos < etapa5) {
      return 4;
    } else {
      return 5;
    }
  }
  private getNumeroEtapaMaiz(lote: ILoteTabla) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    const fecha = new Date().toISOString();
    if (!siembra?.fechaSiembra || !crono) return 0;

    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaActual = new Date(fecha);
    const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
    const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    const etapasSoja = crono?.etapas as IEtapasMaiz;

    const etapa1 = etapasSoja?.siembra_emergencia!;
    const etapa2 = etapa1 + etapasSoja?.emergencia_floracion!;
    const etapa3 = etapa2 + etapasSoja?.floracion_madurez!;

    if (diasTransucurridos < etapa1) {
      return 0;
    } else if (diasTransucurridos < etapa2) {
      return 1;
    } else if (diasTransucurridos < etapa3) {
      return 2;
    } else {
      return 3;
    }
  }
  private getNumeroEtapaCebada(lote: ILoteTabla) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    const fecha = new Date().toISOString();
    if (!siembra?.fechaSiembra || !crono) return 0;

    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaActual = new Date(fecha);
    const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
    const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    const etapasCebada = crono?.etapas as IEtapasCebada;

    const etapa1 = etapasCebada?.siembra_emergencia || 0;
    const etapa2 = etapa1 + (etapasCebada?.emergencia_primer_nudo || 0);
    const etapa3 = etapa2 + (etapasCebada?.primer_nudo_hoja_bandera || 0);
    const etapa4 = etapa3 + (etapasCebada?.hoja_bandera_espigazon || 0);
    const etapa5 = etapa4 + (etapasCebada?.espigazon_antesis || 0);
    const etapa6 = etapa5 + (etapasCebada?.antesis_llenado_granos || 0);
    const etapa7 = etapa6 + (etapasCebada?.llenado_granos_madurez_fisiologica || 0);

    if (diasTransucurridos < etapa1) {
      return 0;
    } else if (diasTransucurridos < etapa2) {
      return 1;
    } else if (diasTransucurridos < etapa3) {
      return 2;
    } else if (diasTransucurridos < etapa4) {
      return 3;
    } else if (diasTransucurridos < etapa5) {
      return 4;
    } else if (diasTransucurridos < etapa6) {
      return 5;
    } else if (diasTransucurridos < etapa7) {
      return 6;
    } else {
      return 7;
    }
  }
  public getNumeroEtapa(lote?: ILoteTabla) {
    switch (lote?.siembra?.crono?.cultivo) {
      case 'Soja':
        return this.getNumeroEtapaSoja(lote);
      case 'Trigo':
        return this.getNumeroEtapaTrigo(lote);
      case 'Maiz':
        return this.getNumeroEtapaMaiz(lote);
      case 'Cebada':
        return this.getNumeroEtapaCebada(lote);
      default:
        return 0;
    }
  }
  private getNombreEtapaTrigo(lote: ILoteTabla) {
    const ETAPAS_TRIGO: string[] = [
      this.translate.instant('Siembra'),
      this.translate.instant('Emergencia'),
      this.translate.instant('Espiguilla Terminal'),
      this.translate.instant('Hoja Bandera'),
      this.translate.instant('Espigazón'),
      this.translate.instant('Antesis'),
      this.translate.instant('Llenado de Granos'),
      this.translate.instant('Maduréz Fisiológica'),
    ];
    const numero = this.getNumeroEtapaTrigo(lote);
    return ETAPAS_TRIGO[numero];
  }
  private getNombreEtapaSoja(lote: ILoteTabla) {
    const ETAPAS_SOJA: string[] = [
      this.translate.instant('Siembra'),
      this.translate.instant('Emergencia'),
      this.translate.instant('Floración'),
      this.translate.instant('Fructificación'),
      this.translate.instant('Inicio de llenado'),
      this.translate.instant('Maduréz Fisiológica'),
    ];
    const numero = this.getNumeroEtapaSoja(lote);
    return ETAPAS_SOJA[numero];
  }
  private getNombreEtapaMaiz(lote: ILoteTabla) {
    const ETAPAS_MAIZ: string[] = [
      this.translate.instant('Siembra'),
      this.translate.instant('Emergencia'),
      this.translate.instant('Floración'),
      this.translate.instant('Maduréz Fisiológica'),
    ];
    const numero = this.getNumeroEtapaMaiz(lote);
    return ETAPAS_MAIZ[numero];
  }
  private getNombreEtapaCebada(lote: ILoteTabla) {
    const ETAPAS_CEBADA: string[] = [
      this.translate.instant('Siembra'),
      this.translate.instant('Emergencia'),
      this.translate.instant('Primer Nudo'),
      this.translate.instant('Hoja Bandera'),
      this.translate.instant('Espigazon'),
      this.translate.instant('Antesis'),
      this.translate.instant('Llenado de Granos'),
      this.translate.instant('Madurez Fisiologica'),
    ];
    const numero = this.getNumeroEtapaCebada(lote);
    return ETAPAS_CEBADA[numero];
  }
  public getNombreEtapa(lote?: ILoteTabla) {
    switch (lote?.siembra?.crono?.cultivo) {
      case 'Soja':
        return this.getNombreEtapaSoja(lote);
      case 'Trigo':
        return this.getNombreEtapaTrigo(lote);
      case 'Maiz':
        return this.getNombreEtapaMaiz(lote);
      case 'Cebada':
        return this.getNombreEtapaCebada(lote);
      default:
        return '';
    }
  }
  private getFechaInicioEtapaTrigo(lote?: ILoteTabla, etapaActual?: number) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    if (!siembra?.fechaSiembra || !crono || !etapaActual) return;

    const etapas = [];
    const etapasCrono = crono?.etapas as IEtapasTrigo;

    etapas[0] = 0;
    etapas[1] = etapasCrono.R0_R1!;
    etapas[2] = etapas[1] + etapasCrono.R1_R2!;
    etapas[3] = etapas[2] + etapasCrono.R2_R3!;
    etapas[4] = etapas[3] + etapasCrono.R3_R4!;
    etapas[5] = etapas[4] + etapasCrono.R4_R5!;
    etapas[6] = etapas[5] + etapasCrono.R5_R6!;
    etapas[7] = etapas[6] + etapasCrono.R6_R7!;

    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapaActual] * 24 * 60 * 60 * 1000);
    return fechaInicioEtapa;
  }
  private getFechaInicioEtapaSoja(lote?: ILoteTabla, etapaActual?: number) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    if (!siembra?.fechaSiembra || !crono || !etapaActual) return;

    const etapas = [];
    const etapasTrigo = crono.etapas as IEtapasSoja;

    etapas[0] = 0;
    etapas[1] = etapasTrigo.siembra_emergencia!;
    etapas[2] = etapas[1] + etapasTrigo.emergencia_R1!;
    etapas[3] = etapas[2] + etapasTrigo.R1_R3!;
    etapas[4] = etapas[3] + etapasTrigo.R3_R5!;
    etapas[5] = etapas[4] + etapasTrigo.R5_R7!;
    const fechaSiembra = new Date(siembra.fechaSiembra);

    const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapaActual] * 24 * 60 * 60 * 1000);
    return fechaInicioEtapa;
  }
  private getFechaInicioEtapaMaiz(lote?: ILoteTabla, etapaActual?: number) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    if (!siembra?.fechaSiembra || !crono || !etapaActual) return;

    const etapas = [];
    const etapasTrigo = crono.etapas as IEtapasMaiz;

    etapas[0] = 0;
    etapas[1] = etapasTrigo.siembra_emergencia!;
    etapas[2] = etapas[1] + etapasTrigo.emergencia_floracion!;
    etapas[3] = etapas[2] + etapasTrigo.floracion_madurez!;
    const fechaSiembra = new Date(siembra.fechaSiembra);

    const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapaActual] * 24 * 60 * 60 * 1000);
    return fechaInicioEtapa;
  }
  private getFechaInicioEtapaCebada(lote?: ILoteTabla, etapaActual?: number) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    if (!siembra?.fechaSiembra || !crono || !etapaActual) return;

    const etapas = this.getEtapasCebadaAcumuladas(crono);
    const fechaSiembra = new Date(siembra.fechaSiembra);

    const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapaActual] * 24 * 60 * 60 * 1000);
    return fechaInicioEtapa;
  }
  private getDuracionEtapaTrigo(lote?: ILoteTabla, etapa?: number) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    if (!siembra?.fechaSiembra || !crono || !etapa) return;

    const etapas = [];
    const etapasCrono = crono?.etapas as IEtapasTrigo;

    etapas[0] = 0;
    etapas[1] = etapasCrono.R0_R1!;
    etapas[2] = etapas[1] + etapasCrono.R1_R2!;
    etapas[3] = etapas[2] + etapasCrono.R2_R3!;
    etapas[4] = etapas[3] + etapasCrono.R3_R4!;
    etapas[5] = etapas[4] + etapasCrono.R4_R5!;
    etapas[6] = etapas[5] + etapasCrono.R5_R6!;
    etapas[7] = etapas[6] + etapasCrono.R6_R7!;

    const fechaSiembra = new Date(siembra.fechaSiembra);
    const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapa] * 24 * 60 * 60 * 1000);
    const fechaInicioEtapaSiguiente = new Date(fechaSiembra.getTime() + etapas[etapa + 1] * 24 * 60 * 60 * 1000);
    const diferencia = fechaInicioEtapaSiguiente.getTime() - fechaInicioEtapa.getTime();
    return diferencia;
  }
  private getDuracionEtapaSoja(lote?: ILoteTabla, etapa?: number) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    if (!siembra?.fechaSiembra || !crono || !etapa) return;

    const etapas = [];
    const etapasTrigo = crono.etapas as IEtapasSoja;

    etapas[0] = 0;
    etapas[1] = etapasTrigo.siembra_emergencia!;
    etapas[2] = etapas[1] + etapasTrigo.emergencia_R1!;
    etapas[3] = etapas[2] + etapasTrigo.R1_R3!;
    etapas[4] = etapas[3] + etapasTrigo.R3_R5!;
    etapas[5] = etapas[4] + etapasTrigo.R5_R7!;
    const fechaSiembra = new Date(siembra.fechaSiembra);

    const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapa] * 24 * 60 * 60 * 1000);
    const fechaInicioEtapaSiguiente = new Date(fechaSiembra.getTime() + etapas[etapa + 1] * 24 * 60 * 60 * 1000);
    const diferencia = fechaInicioEtapaSiguiente.getTime() - fechaInicioEtapa.getTime();
    return diferencia;
  }
  private getDuracionEtapaMaiz(lote?: ILoteTabla, etapa?: number) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    if (!siembra?.fechaSiembra || !crono || !etapa) return;

    const etapas = [];
    const etapasTrigo = crono.etapas as IEtapasMaiz;

    etapas[0] = 0;
    etapas[1] = etapasTrigo.siembra_emergencia!;
    etapas[2] = etapas[1] + etapasTrigo.emergencia_floracion!;
    etapas[3] = etapas[2] + etapasTrigo.floracion_madurez!;
    const fechaSiembra = new Date(siembra.fechaSiembra);

    const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapa] * 24 * 60 * 60 * 1000);
    const fechaInicioEtapaSiguiente = new Date(fechaSiembra.getTime() + etapas[etapa + 1] * 24 * 60 * 60 * 1000);
    const diferencia = fechaInicioEtapaSiguiente.getTime() - fechaInicioEtapa.getTime();
    return diferencia;
  }
  private getDuracionEtapaCebada(lote?: ILoteTabla, etapa?: number) {
    const siembra = lote?.siembra;
    const crono = lote?.siembra?.crono;
    if (!siembra?.fechaSiembra || !crono || !etapa) return;

    const etapas = this.getEtapasCebadaAcumuladas(crono);
    const fechaSiembra = new Date(siembra.fechaSiembra);

    const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapa] * 24 * 60 * 60 * 1000);
    const fechaInicioEtapaSiguiente = new Date(fechaSiembra.getTime() + etapas[etapa + 1] * 24 * 60 * 60 * 1000);
    const diferencia = fechaInicioEtapaSiguiente.getTime() - fechaInicioEtapa.getTime();
    return diferencia;
  }
  private getEtapasCebadaAcumuladas(crono: ICrono): number[] {
    const etapasCrono = crono.etapas as IEtapasCebada;
    const etapas = [];
    etapas[0] = 0;
    etapas[1] = etapasCrono.siembra_emergencia || 0;
    etapas[2] = etapas[1] + (etapasCrono.emergencia_primer_nudo || 0);
    etapas[3] = etapas[2] + (etapasCrono.primer_nudo_hoja_bandera || 0);
    etapas[4] = etapas[3] + (etapasCrono.hoja_bandera_espigazon || 0);
    etapas[5] = etapas[4] + (etapasCrono.espigazon_antesis || 0);
    etapas[6] = etapas[5] + (etapasCrono.antesis_llenado_granos || 0);
    etapas[7] = etapas[6] + (etapasCrono.llenado_granos_madurez_fisiologica || 0);
    return etapas;
  }
  public getFechaInicioEtapa(lote?: ILoteTabla) {
    const etapaActual = this.getNumeroEtapa(lote);
    switch (lote?.siembra?.crono?.cultivo) {
      case 'Soja':
        return this.getFechaInicioEtapaSoja(lote, etapaActual);
      case 'Trigo':
        return this.getFechaInicioEtapaTrigo(lote, etapaActual);
      case 'Maiz':
        return this.getFechaInicioEtapaMaiz(lote, etapaActual);
      case 'Cebada':
        return this.getFechaInicioEtapaCebada(lote, etapaActual);
      default:
        return;
    }
  }
  public getFechaFinEtapa(lote?: ILoteTabla) {
    const etapaActual = this.getNumeroEtapa(lote);
    switch (lote?.siembra?.crono?.cultivo) {
      case 'Soja': {
        const inicio = this.getFechaInicioEtapaSoja(lote, etapaActual);
        const duracion = this.getDuracionEtapaSoja(lote, etapaActual);
        return new Date(inicio!.getTime() + duracion!);
      }
      case 'Trigo': {
        const inicio = this.getFechaInicioEtapaTrigo(lote, etapaActual);
        const duracion = this.getDuracionEtapaTrigo(lote, etapaActual);
        return new Date(inicio!.getTime() + duracion!);
      }
      case 'Maiz': {
        const inicio = this.getFechaInicioEtapaMaiz(lote, etapaActual);
        const duracion = this.getDuracionEtapaMaiz(lote, etapaActual);
        return new Date(inicio!.getTime() + duracion!);
      }
      case 'Cebada': {
        const inicio = this.getFechaInicioEtapaCebada(lote, etapaActual);
        const duracion = this.getDuracionEtapaCebada(lote, etapaActual);
        return new Date(inicio!.getTime() + duracion!);
      }
      default:
        return;
    }
  }
  public getEsUltimaEtapa(lote?: ILoteTabla, numeroEtapa?: number) {
    switch (lote?.siembra?.crono?.cultivo) {
      case 'Soja':
        return numeroEtapa === 5;
      case 'Trigo':
        return numeroEtapa === 7;
      case 'Maiz':
        return numeroEtapa === 3;
      case 'Cebada':
        return numeroEtapa === 7;
      default:
        return false;
    }
  }
  public getFechaInicioEtapaTrigo2(siembra: ISiembra, etapa: 1 | 2 | 3 | 4 | 5 | 6 | 7, crono?: ICrono) {
    if (crono && siembra.fechaSiembra) {
      const etapas = [];

      const etapasTrigo = crono.etapas as IEtapasTrigo;

      etapas[0] = 0;
      etapas[1] = etapasTrigo.R0_R1!;
      etapas[2] = etapas[1] + etapasTrigo.R1_R2!;
      etapas[3] = etapas[2] + etapasTrigo.R2_R3!;
      etapas[4] = etapas[3] + etapasTrigo.R3_R4!;
      etapas[5] = etapas[4] + etapasTrigo.R4_R5!;
      etapas[6] = etapas[5] + etapasTrigo.R5_R6!;
      etapas[7] = etapas[6] + etapasTrigo.R6_R7!;
      const fechaSiembra = new Date(siembra.fechaSiembra);
      const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapa] * 24 * 60 * 60 * 1000);
      return fechaInicioEtapa.toISOString();
    }
    return;
  }
  public getFechaInicioEtapaSoja2(
    siembra: ISiembra,
    etapa: 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7',
    crono?: ICrono
  ) {
    if (crono && siembra.fechaSiembra) {
      const etapas = [];

      const etapasTrigo = crono.etapas as IEtapasSoja;

      etapas[0] = 0;
      etapas[1] = etapasTrigo.siembra_emergencia!;
      etapas[2] = etapas[1] + etapasTrigo.emergencia_R1!;
      etapas[3] = etapas[2] + etapasTrigo.R1_R3!;
      etapas[4] = etapas[3] + etapasTrigo.R3_R5!;
      etapas[5] = etapas[4] + etapasTrigo.R5_R7!;
      const fechaSiembra = new Date(siembra.fechaSiembra);

      const etapaANum = {
        Siembra: 0,
        Emergencia: 1,
        R1: 2,
        R3: 3,
        R5: 4,
        R7: 5,
      };

      const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapaANum[etapa]]! * 24 * 60 * 60 * 1000);
      return fechaInicioEtapa.toISOString();
    }
    return;
  }
  public getFechaInicioEtapaMaiz2(
    siembra: ISiembra,
    etapa: 'Siembra' | 'Emergencia' | 'Floracion' | 'Madurez',
    crono?: ICrono
  ) {
    if (crono && siembra.fechaSiembra) {
      const etapas = [];

      const etapasTrigo = crono.etapas as IEtapasMaiz;

      etapas[0] = 0;
      etapas[1] = etapasTrigo.siembra_emergencia!;
      etapas[2] = etapas[1] + etapasTrigo.emergencia_floracion!;
      etapas[3] = etapas[2] + etapasTrigo.floracion_madurez!;
      const fechaSiembra = new Date(siembra.fechaSiembra);

      const etapaANum = {
        Siembra: 0,
        Emergencia: 1,
        Floracion: 2,
        Madurez: 3,
      };

      const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapaANum[etapa]]! * 24 * 60 * 60 * 1000);
      return fechaInicioEtapa.toISOString();
    }
    return;
  }
  public getFechaInicioEtapaCebada2(
    siembra: ISiembra,
    etapa:
      | 'Siembra'
      | 'Emergencia'
      | 'Primer Nudo'
      | 'Hoja Bandera'
      | 'Espigazon'
      | 'Antesis'
      | 'Llenado de Granos'
      | 'Madurez Fisiologica',
    crono?: ICrono
  ) {
    if (crono && siembra.fechaSiembra) {
      const etapas = this.getEtapasCebadaAcumuladas(crono);
      const fechaSiembra = new Date(siembra.fechaSiembra);

      const etapaANum = {
        Siembra: 0,
        Emergencia: 1,
        'Primer Nudo': 2,
        'Hoja Bandera': 3,
        Espigazon: 4,
        Antesis: 5,
        'Llenado de Granos': 6,
        'Madurez Fisiologica': 7,
      };

      const fechaInicioEtapa = new Date(fechaSiembra.getTime() + etapas[etapaANum[etapa]]! * 24 * 60 * 60 * 1000);
      return fechaInicioEtapa.toISOString();
    }
    return;
  }

  ///

  static getEtapaPorFechaTrigo(siembra: ISiembra, fecha: string, crono?: ICrono) {
    if (crono && siembra.fechaSiembra) {
      const fechaSiembra = new Date(siembra.fechaSiembra);
      const fechaActual = new Date(fecha);
      const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
      const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

      const etapasTrigo = crono?.etapas as IEtapasTrigo;

      const etapa1 = etapasTrigo?.R0_R1!;
      const etapa2 = etapa1 + etapasTrigo?.R1_R2!;
      const etapa3 = etapa2 + etapasTrigo?.R2_R3!;
      const etapa4 = etapa3 + etapasTrigo?.R3_R4!;
      const etapa5 = etapa4 + etapasTrigo?.R4_R5!;
      const etapa6 = etapa5 + etapasTrigo?.R5_R6!;
      const etapa7 = etapa6 + etapasTrigo?.R6_R7!;

      if (diasTransucurridos < etapa1) {
        return 0;
      } else if (diasTransucurridos < etapa2) {
        return 1;
      } else if (diasTransucurridos < etapa3) {
        return 2;
      } else if (diasTransucurridos < etapa4) {
        return 3;
      } else if (diasTransucurridos < etapa5) {
        return 4;
      } else if (diasTransucurridos < etapa6) {
        return 5;
      } else if (diasTransucurridos < etapa7) {
        return 6;
      } else {
        return 7;
      }
    }
    return 0;
  }

  static getEtapaPorFechaSoja(
    siembra: ISiembra,
    fecha: string,
    crono?: ICrono
  ): 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7' | void {
    if (crono && siembra.fechaSiembra) {
      const fechaSiembra = new Date(siembra.fechaSiembra);
      const fechaActual = new Date(fecha);
      const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
      const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

      const etapasSoja = crono?.etapas as IEtapasSoja;

      const etapa1 = etapasSoja?.siembra_emergencia!;
      const etapa2 = etapa1 + etapasSoja?.emergencia_R1!;
      const etapa3 = etapa2 + etapasSoja?.R1_R3!;
      const etapa4 = etapa3 + etapasSoja?.R3_R5!;
      const etapa5 = etapa4 + etapasSoja?.R5_R7!;

      if (diasTransucurridos < etapa1) {
        return 'Siembra';
      } else if (diasTransucurridos < etapa2) {
        return 'Emergencia';
      } else if (diasTransucurridos < etapa3) {
        return 'R1';
      } else if (diasTransucurridos < etapa4) {
        return 'R3';
      } else if (diasTransucurridos < etapa5) {
        return 'R5';
      } else {
        return 'R7';
      }
    }
  }

  static etapaSojaANumero(etapa: 'Siembra' | 'Emergencia' | 'R1' | 'R3' | 'R5' | 'R7' | void) {
    if (!etapa) {
      return 0;
    }
    const etapaANum = {
      Siembra: 0,
      Emergencia: 1,
      R1: 2,
      R3: 3,
      R5: 4,
      R7: 5,
    };
    return etapaANum[etapa];
  }

  static getEtapaPorFechaMaiz(
    siembra: ISiembra,
    fecha: string,
    crono?: ICrono
  ): 'Siembra' | 'Emergencia' | 'Floracion' | 'Madurez' | void {
    if (crono && siembra.fechaSiembra) {
      const fechaSiembra = new Date(siembra.fechaSiembra);
      const fechaActual = new Date(fecha);
      const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
      const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

      const etapasSoja = crono?.etapas as IEtapasMaiz;

      const etapa1 = etapasSoja?.siembra_emergencia!;
      const etapa2 = etapa1 + etapasSoja?.emergencia_floracion!;
      const etapa3 = etapa2 + etapasSoja?.floracion_madurez!;

      if (diasTransucurridos < etapa1) {
        return 'Siembra';
      } else if (diasTransucurridos < etapa2) {
        return 'Emergencia';
      } else if (diasTransucurridos < etapa3) {
        return 'Floracion';
      } else {
        return 'Madurez';
      }
    }
  }

  static etapaMaizANumero(etapa: 'Siembra' | 'Emergencia' | 'Floracion' | 'Madurez' | void) {
    if (!etapa) {
      return 0;
    }
    const etapaANum = {
      Siembra: 0,
      Emergencia: 1,
      Floracion: 2,
      Madurez: 3,
    };
    return etapaANum[etapa];
  }

  static getEtapaPorFechaCebada(
    siembra: ISiembra,
    fecha: string,
    crono?: ICrono
  ):
    | 'Siembra'
    | 'Emergencia'
    | 'Primer Nudo'
    | 'Hoja Bandera'
    | 'Espigazon'
    | 'Antesis'
    | 'Llenado de Granos'
    | 'Madurez Fisiologica'
    | void {
    if (crono && siembra.fechaSiembra) {
      const fechaSiembra = new Date(siembra.fechaSiembra);
      const fechaActual = new Date(fecha);
      const diferencia = fechaActual.getTime() - fechaSiembra.getTime();
      const diasTransucurridos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

      const etapasCebada = crono?.etapas as IEtapasCebada;
      const etapa1 = etapasCebada?.siembra_emergencia || 0;
      const etapa2 = etapa1 + (etapasCebada?.emergencia_primer_nudo || 0);
      const etapa3 = etapa2 + (etapasCebada?.primer_nudo_hoja_bandera || 0);
      const etapa4 = etapa3 + (etapasCebada?.hoja_bandera_espigazon || 0);
      const etapa5 = etapa4 + (etapasCebada?.espigazon_antesis || 0);
      const etapa6 = etapa5 + (etapasCebada?.antesis_llenado_granos || 0);
      const etapa7 = etapa6 + (etapasCebada?.llenado_granos_madurez_fisiologica || 0);

      if (diasTransucurridos < etapa1) {
        return 'Siembra';
      } else if (diasTransucurridos < etapa2) {
        return 'Emergencia';
      } else if (diasTransucurridos < etapa3) {
        return 'Primer Nudo';
      } else if (diasTransucurridos < etapa4) {
        return 'Hoja Bandera';
      } else if (diasTransucurridos < etapa5) {
        return 'Espigazon';
      } else if (diasTransucurridos < etapa6) {
        return 'Antesis';
      } else if (diasTransucurridos < etapa7) {
        return 'Llenado de Granos';
      } else {
        return 'Madurez Fisiologica';
      }
    }
  }

  static etapaCebadaANumero(
    etapa:
      | 'Siembra'
      | 'Emergencia'
      | 'Primer Nudo'
      | 'Hoja Bandera'
      | 'Espigazon'
      | 'Antesis'
      | 'Llenado de Granos'
      | 'Madurez Fisiologica'
      | void
  ) {
    if (!etapa) {
      return 0;
    }
    const etapaANum = {
      Siembra: 0,
      Emergencia: 1,
      'Primer Nudo': 2,
      'Hoja Bandera': 3,
      Espigazon: 4,
      Antesis: 5,
      'Llenado de Granos': 6,
      'Madurez Fisiologica': 7,
    };
    return etapaANum[etapa];
  }

  // FECHAS
  // *************************************** //
  public nombreCortoDia(fecha?: string): string {
    if (!fecha) return '';
    const date = new Date(fecha);
    date.setHours(date.getHours() + 3); // Ajuste horario
    return date.toLocaleDateString('es-AR', { weekday: 'short' });
  }

  // VARIOS
  // *************************************** //
  public volver() {
    window.history.back();
  }

  // Permisos
  // *************************************** //
  public soloLectura(): boolean {
    if (this.user) {
      const res = this.user.permisos?.find((permiso) => permiso.rol === 'Admin' || permiso.rol === 'Escritura');
      if (res) {
        return false;
      } else {
        return true;
      }
    } else {
      return true;
    }
  }

  public truncateString(str: string, length: number): string {
    if (str.length > length) {
      return str.substring(0, length) + '...';
    }
    return str;
  }

  // FEchas
  /**
   *
   * @param fecha Fecha en formato string o Date
   * @description Calcula la diferencia en días entre la fecha proporcionada y la fecha actual.
   * @returns number (Días)
   */
  public dateToDias(fecha: string | Date): number {
    if (!fecha) return 0;
    const date = new Date(fecha);
    const today = new Date();
    const diferencia = today.getTime() - date.getTime();
    return Math.abs(Math.floor(diferencia / (1000 * 60 * 60 * 24)));
  }

  /**
   * Copia un texto al portapapeles y muestra una notificación.
   * @param text El texto que se va a copiar.
   */
  public copyToClipboard(text: string) {
    // Copia el texto
    this.clipboard.copy(text);

    // Muestra el toast de confirmación
    this.messageService.add({
      severity: 'success',
      summary: 'Copiado',
      detail: '¡El texto se ha copiado al portapapeles!',
      life: 2000, // Duración del toast en milisegundos
    });
  }

  ///
  public checkArray(array?: any[]): boolean {
    // True si tiene algo
    if (array && Array.isArray(array) && array.length > 0) {
      return true;
    } else {
      return false;
    }
  }
}
