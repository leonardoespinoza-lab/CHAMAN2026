import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { ICoordenadas, IGeoJSONPolygon } from 'modelos/src';
import KML from 'ol/format/KML';
import { GeometryCollection, MultiPolygon, Polygon } from 'ol/geom';
import { HelperService } from './helper';

export interface IKmzPolygonImportado {
  id: string;
  nombre: string;
  geojson: IGeoJSONPolygon;
  centro: ICoordenadas;
  superficie: number;
}

@Injectable({
  providedIn: 'root',
})
export class KmlKmzImportService {
  constructor(private helper: HelperService) {}

  public async leerPoligonos(file: File): Promise<IKmzPolygonImportado[]> {
    if (!file) throw new Error('No se selecciono ningun archivo.');

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.kml') && !fileName.endsWith('.kmz')) {
      throw new Error('El archivo debe ser KML o KMZ.');
    }

    const kmlText = await this.leerKml(file, fileName);
    const features = new KML().readFeatures(this.limpiarKml(kmlText), {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:4326',
    });

    const poligonos: IKmzPolygonImportado[] = [];
    for (const feature of features) {
      const geometry = feature.getGeometry();
      const nombreBase = `${feature.get('name') || feature.get('nombre') || 'Poligono importado'}`.trim();
      const polygons = this.extraerPoligonos(geometry);
      polygons.forEach((coordinates, index) => {
        const geojson: IGeoJSONPolygon = {
          type: 'Polygon',
          coordinates,
        };
        const centro = this.helper.calcularCentroide(geojson);
        if (!centro?.length || !Number.isFinite(centro[0]) || !Number.isFinite(centro[1])) return;
        const superficie = this.helper.calcularAreaHectareas(geojson);
        if (!Number.isFinite(superficie)) return;
        poligonos.push({
          id: crypto.randomUUID(),
          nombre: polygons.length > 1 ? `${nombreBase} ${index + 1}` : nombreBase,
          geojson,
          centro: { lat: centro[1], lng: centro[0] },
          superficie,
        });
      });
    }

    if (!poligonos.length) {
      throw new Error('El archivo no contiene poligonos validos para crear establecimientos o lotes.');
    }

    return poligonos;
  }

  private async leerKml(file: File, fileName: string): Promise<string> {
    if (fileName.endsWith('.kml')) {
      return await file.text();
    }

    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlFile = Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith('.kml'));
    if (!kmlFile) {
      throw new Error('No se encontro ningun archivo .kml dentro del KMZ.');
    }

    return await kmlFile.async('text');
  }

  private limpiarKml(kmlText: string): string {
    if (!kmlText || typeof kmlText !== 'string') {
      throw new Error('El KML esta vacio o no se pudo leer.');
    }
    return kmlText
      .replace(/<Style[\s\S]*?<\/Style>/gi, '')
      .replace(/<StyleMap[\s\S]*?<\/StyleMap>/gi, '');
  }

  private extraerPoligonos(geometry: any): Array<[[number, number][]]> {
    if (!geometry) return [];

    if (geometry instanceof Polygon) {
      return [this.normalizarPolygonCoordinates(geometry.getCoordinates())].filter(Boolean) as Array<[[number, number][]]>;
    }

    if (geometry instanceof MultiPolygon) {
      return geometry
        .getCoordinates()
        .map((coords) => this.normalizarPolygonCoordinates(coords))
        .filter(Boolean) as Array<[[number, number][]]>;
    }

    if (geometry instanceof GeometryCollection) {
      return geometry.getGeometries().flatMap((item) => this.extraerPoligonos(item));
    }

    return [];
  }

  private normalizarPolygonCoordinates(coords: number[][][]): [[number, number][]] | undefined {
    const rings = coords
      .map((ring) => this.normalizarRing(ring))
      .filter((ring): ring is [number, number][] => ring.length >= 4);
    if (!rings.length) return undefined;
    return rings as [[number, number][]];
  }

  private normalizarRing(ring: number[][]): [number, number][] {
    const points = ring
      .map((coord) => [Number(coord[0]), Number(coord[1])] as [number, number])
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

    if (!points.length) return [];

    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      points.push([...first]);
    }

    return points;
  }
}
