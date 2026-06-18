import { Injectable, Logger } from '@nestjs/common';
import { ICoordenadas, DireccionV2, IZonaGeografica } from 'modelos/src';
import NodeGeocoder, { Options } from 'node-geocoder';
import { AxiosService } from 'src/auxiliares/axios/axios.service';
import { MAPS_KEY } from 'src/env';

const options: Options = {
  provider: 'google',
  apiKey: MAPS_KEY, // for Mapquest, OpenCage, Google Premier
  formatter: null, // 'gpx', 'string', ...
};

@Injectable()
export class NodeGeocodeService {
  constructor(private axios: AxiosService) {}

  public async buscarZonasArgentina(text: string, provincia?: string): Promise<IZonaGeografica[]> {
    const query = this.limpiarBusqueda(text);
    if (query.length < 2) return [];

    const [localidades, departamentos, provincias] = await Promise.allSettled([
      this.buscarLocalidadesGeoref(query, provincia),
      this.buscarDepartamentosGeoref(query, provincia),
      provincia ? Promise.resolve([]) : this.buscarProvinciasGeoref(query),
    ]);

    return this.deduplicarZonas([
      ...(localidades.status === 'fulfilled' ? localidades.value : []),
      ...(departamentos.status === 'fulfilled' ? departamentos.value : []),
      ...(provincias.status === 'fulfilled' ? provincias.value : []),
    ]).slice(0, 15);
  }

  public async listarProvinciasArgentina(): Promise<IZonaGeografica[]> {
    const response = await this.axios.GET<{
      provincias?: Array<{
        id?: string;
        nombre?: string;
        centroide?: { lat?: number; lon?: number };
      }>;
    }>('https://apis.datos.gob.ar/georef/api/provincias?max=30', {
      timeout: 8000,
    });

    return (response.provincias || [])
      .filter((item) => Number.isFinite(item.centroide?.lat) && Number.isFinite(item.centroide?.lon))
      .map((item) => ({
        id: item.id,
        tipo: 'provincia' as const,
        label: item.nombre,
        provincia: item.nombre,
        coordenadas: {
          lat: item.centroide.lat,
          lng: item.centroide.lon,
        },
        fuente: 'GeoRef Argentina',
      }))
      .sort((a, b) => `${a.provincia}`.localeCompare(`${b.provincia}`));
  }

  public async reverse(coordenadas: ICoordenadas): Promise<DireccionV2> {
    try {
      const geoCoder = NodeGeocoder(options);
      const response: NodeGeocoder.Entry[] = await geoCoder.reverse({
        lat: coordenadas.lat,
        lon: coordenadas.lng,
      });
      const direccion: DireccionV2 = {
        provincia: response[0].administrativeLevels?.level1long,
        partido: response[0].administrativeLevels?.level2long,
        localidad: response[0].city,
        // Barrio no viene, pero se podría completar después con las comunas o algo de eso
        barrio: response[0].city,
        calle: response[0].streetName,
        numero: response[0].streetNumber,
        direccion: response[0].formattedAddress,
        coordenadas,
      };
      return direccion;
    } catch (error) {
      Logger.error(error, 'NodeGeocodeService');
      return undefined;
    }
  }

  public async geocode(direccion: string): Promise<ICoordenadas> {
    try {
      const geoCoder = NodeGeocoder(options);
      const response = await geoCoder.geocode(direccion);
      return { lat: response[0].latitude, lng: response[0].longitude };
    } catch (error) {
      Logger.error(error, 'NodeGeocodeService');
      return { lat: 0, lng: 0 };
    }
  }

  public async getPredictions(
    text: string,
    pais = 'ar',
    coordenadas?: ICoordenadas,
  ) {
    if (!text) return [];
    text = text.trim();
    text = text.split('á').join('a');
    text = text.split('é').join('e');
    text = text.split('í').join('i');
    text = text.split('ó').join('o');
    text = text.split('ú').join('u');
    text = text.split('ñ').join('n');

    text = text.replace(/[^a-zA-Z0-9\s]/g, '');

    // Nueva Places API - Text Search (New)
    const requestBody: any = {
      textQuery: text,
      regionCode: pais.toUpperCase(),
      maxResultCount: 10,
    };

    // Agregar locationRestriction solo si hay coordenadas
    if (coordenadas) {
      requestBody.locationBias = {
        circle: {
          center: {
            latitude: coordenadas.lat,
            longitude: coordenadas.lng,
          },
          radius: 50000.0, // 50km en metros (máximo permitido)
        },
      };
    }

    try {
      const result = await this.axios.POST<{
        places: Array<{
          formattedAddress: string;
          displayName?: {
            text: string;
          };
        }>;
      }>('https://places.googleapis.com/v1/places:searchText', requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': MAPS_KEY,
          'X-Goog-FieldMask': 'places.formattedAddress,places.displayName',
        },
      });

      const resp: string[] = [];
      for (const place of result.places || []) {
        resp.push(place.formattedAddress);
      }
      return resp;
    } catch (error) {
      Logger.error('Error en getPredictions:', error, 'NodeGeocodeService');
      return [];
    }
  }

  private async buscarLocalidadesGeoref(query: string, provincia?: string): Promise<IZonaGeografica[]> {
    const url = this.crearGeorefUrl('localidades', query, provincia);
    const response = await this.axios.GET<{
      localidades?: Array<{
        id?: string;
        nombre?: string;
        categoria?: string;
        centroide?: { lat?: number; lon?: number };
        departamento?: { id?: string; nombre?: string };
        provincia?: { id?: string; nombre?: string };
        municipio?: { id?: string; nombre?: string };
      }>;
    }>(url, { timeout: 8000 });

    return (response.localidades || [])
      .filter((item) => Number.isFinite(item.centroide?.lat) && Number.isFinite(item.centroide?.lon))
      .map((item) => ({
        id: item.id,
        tipo: 'localidad',
        label: this.formatearLabel(item.nombre, item.departamento?.nombre, item.provincia?.nombre),
        localidad: item.nombre,
        departamento: item.departamento?.nombre,
        provincia: item.provincia?.nombre,
        municipio: item.municipio?.nombre,
        coordenadas: {
          lat: item.centroide.lat,
          lng: item.centroide.lon,
        },
        fuente: 'GeoRef Argentina',
      }));
  }

  private async buscarDepartamentosGeoref(query: string, provincia?: string): Promise<IZonaGeografica[]> {
    const url = this.crearGeorefUrl('departamentos', query, provincia);
    const response = await this.axios.GET<{
      departamentos?: Array<{
        id?: string;
        nombre?: string;
        centroide?: { lat?: number; lon?: number };
        provincia?: { id?: string; nombre?: string };
      }>;
    }>(url, { timeout: 8000 });

    return (response.departamentos || [])
      .filter((item) => Number.isFinite(item.centroide?.lat) && Number.isFinite(item.centroide?.lon))
      .map((item) => ({
        id: item.id,
        tipo: 'departamento',
        label: this.formatearLabel(item.nombre, undefined, item.provincia?.nombre),
        departamento: item.nombre,
        provincia: item.provincia?.nombre,
        coordenadas: {
          lat: item.centroide.lat,
          lng: item.centroide.lon,
        },
        fuente: 'GeoRef Argentina',
      }));
  }

  private async buscarProvinciasGeoref(query: string): Promise<IZonaGeografica[]> {
    const url = this.crearGeorefUrl('provincias', query);
    const response = await this.axios.GET<{
      provincias?: Array<{
        id?: string;
        nombre?: string;
        centroide?: { lat?: number; lon?: number };
      }>;
    }>(url, { timeout: 8000 });

    return (response.provincias || [])
      .filter((item) => Number.isFinite(item.centroide?.lat) && Number.isFinite(item.centroide?.lon))
      .map((item) => ({
        id: item.id,
        tipo: 'provincia',
        label: item.nombre,
        provincia: item.nombre,
        coordenadas: {
          lat: item.centroide.lat,
          lng: item.centroide.lon,
        },
        fuente: 'GeoRef Argentina',
      }));
  }

  private deduplicarZonas(zonas: IZonaGeografica[]): IZonaGeografica[] {
    const output = new Map<string, IZonaGeografica>();
    for (const zona of zonas) {
      const key = this.normalizarTexto([zona.tipo, zona.localidad, zona.departamento, zona.provincia].join('|'));
      if (!output.has(key)) {
        output.set(key, zona);
      }
    }
    return [...output.values()];
  }

  private limpiarBusqueda(text: string): string {
    return `${text || ''}`.trim().replace(/\s+/g, ' ');
  }

  private formatearLabel(nombre?: string, departamento?: string, provincia?: string): string {
    return [nombre, departamento, provincia].filter(Boolean).join(', ');
  }

  private crearGeorefUrl(
    endpoint: 'localidades' | 'departamentos' | 'provincias',
    query: string,
    provincia?: string,
  ): string {
    const params = new URLSearchParams({
      nombre: query,
      max: '10',
    });
    if (provincia) {
      params.set('provincia', provincia);
    }
    return `https://apis.datos.gob.ar/georef/api/${endpoint}?${params.toString()}`;
  }

  private normalizarTexto(value?: string): string {
    return `${value || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
