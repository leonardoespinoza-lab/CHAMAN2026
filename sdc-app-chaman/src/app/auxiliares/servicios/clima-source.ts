import TileLayer from 'ol/layer/Tile';
import { XYZ } from 'ol/source';
import { API } from '../../environments/environment';
import { ClimaService } from '../http/clima.service';
import { HelperService } from './helper';

export interface IClimaLayerOptions {
  variable: string;
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  zoom?: number;
}

export class ClimaLayerManager {
  private climaService: ClimaService;
  private helperService: HelperService;
  private activeLayers = new Map<string, TileLayer<XYZ>>();
  private currentZoom = 8;

  constructor(climaService: ClimaService, helperService: HelperService) {
    this.climaService = climaService;
    this.helperService = helperService;
  }

  /**
   * Construye URL template estática para OpenLayers (como OSM, Google Maps, etc.)
   * Esta es la forma CORRECTA de trabajar con OpenLayers
   */
  private buildTileUrl(variable: string): string {
    // URL template que OpenLayers reemplazará automáticamente con {z}/{x}/{y}
    return `${API}/clima/tile/${variable}/{z}/{x}/{y}`;
  }

  /**
   * Crea una nueva capa de clima usando URL template estática
   */
  async createClimaLayer(options: IClimaLayerOptions): Promise<TileLayer<XYZ>> {
    const layer = new TileLayer({
      source: new XYZ({
        // ✅ SOLUCIÓN CORRECTA: URL template estática como OpenLayers espera
        url: this.buildTileUrl(options.variable),
        attributions: 'Datos climáticos de Meteosource',
        crossOrigin: 'anonymous',
        transition: 0, // Sin transición para evitar efectos visuales raros
        tileSize: [256, 256], // Tamaño estándar de tile
        // Meteosource devuelve imágenes más grandes (y visibles) en zooms bajos
        maxZoom: 7,
        minZoom: 1,
        // Configurar headers de autenticación
        tileLoadFunction: (tile: any, src: string) => {
          const img = tile.getImage();
          const token = this.helperService.accessToken;
          const permiso = this.helperService.numeroPermiso;

          if (token) {
            // Crear una nueva request con headers de autenticación
            fetch(src, {
              headers: {
                Authorization: `Bearer ${token}`,
                'X-Permiso': `${permiso || ''}`,
              },
            })
              .then((response) => {
                if (!response.ok) {
                  console.warn(`Tile no disponible: ${src} (${response.status})`);
                  // Retornar tile transparente para tiles no disponibles
                  img.src =
                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                  return;
                }
                return response.blob();
              })
              .then((blob) => {
                if (blob) {
                  const objectURL = URL.createObjectURL(blob);
                  img.src = objectURL;
                }
              })
              .catch((error) => {
                console.warn('Error cargando tile:', error.message);
                // En caso de error, mostrar tile transparente
                img.src =
                  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
              });
          } else {
            console.error('No hay token de acceso disponible');
            img.src =
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
          }
        },
      }),
      opacity: options.opacity || 0.7,
      visible: options.visible || false,
      zIndex: options.zIndex || 100,
      preload: 0, // No precargar tiles adyacentes
    });

    this.currentZoom = options.zoom || 8;

    console.log(
      `✅ Capa ${options.variable} creada con URL template estática y autenticación (método OpenLayers estándar)`
    );

    // Guardar referencia de la capa
    this.activeLayers.set(options.variable, layer);

    return layer;
  }

  /**
   * YA NO NECESITAMOS CONFIGURAR NADA - OpenLayers maneja todo automáticamente
   * Esta es la belleza de usar URL templates estáticas
   */
  private async setupLayerSource(layer: TileLayer<XYZ>, variable: string): Promise<void> {
    console.log(`🎯 Capa ${variable} ya configurada con URL template. OpenLayers manejará automáticamente los tiles.`);
    // No hay nada que hacer aquí - OpenLayers ya tiene la URL template y hará requests automáticamente
  }

  /**
   * Obtiene una capa existente por variable
   */
  getLayer(variable: string): TileLayer<XYZ> | undefined {
    return this.activeLayers.get(variable);
  }

  /**
   * Muestra/oculta una capa de clima
   */
  setLayerVisibility(variable: string, visible: boolean): void {
    const layer = this.activeLayers.get(variable);
    if (layer) {
      layer.setVisible(visible);
    }
  }

  /**
   * Establece la opacidad de una capa
   */
  setLayerOpacity(variable: string, opacity: number): void {
    const layer = this.activeLayers.get(variable);
    if (layer) {
      layer.setOpacity(opacity);
    }
  }

  /**
   * Actualiza el zoom interno (sin recargas innecesarias)
   */
  setZoom(zoom: number): void {
    if (this.currentZoom === zoom) return;

    const oldZoom = this.currentZoom;
    this.currentZoom = zoom;

    console.log(`📏 Zoom cambió de ${oldZoom} a ${zoom} - OpenLayers maneja automáticamente los tiles`);
    // No necesitamos hacer nada más - OpenLayers solicita automáticamente los tiles del nuevo zoom
  }

  /**
   * Obtiene el zoom actual
   */
  getCurrentZoom(): number {
    return this.currentZoom;
  }

  /**
   * Limpia todas las capas
   */
  clearCache(): void {
    console.log('🧹 Limpiando capas climáticas');
    // Con URL templates estáticas, no necesitamos gestionar cache manualmente
  }

  /**
   * Obtiene todas las capas activas
   */
  getAllLayers(): Map<string, TileLayer<XYZ>> {
    return this.activeLayers;
  }
}
