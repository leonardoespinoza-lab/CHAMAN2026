import { Injectable, Logger } from '@nestjs/common';
import { ICoordenadas } from 'modelos/src';

export interface ITileBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface ITile {
  x: number;
  y: number;
  z: number;
}

@Injectable()
export class TileCalculationService {
  private readonly logger = new Logger(TileCalculationService.name);

  /**
   * Calcula tiles que intersectan con un polígono usando algoritmo de intersección geométrica
   * Este es el algoritmo principal usado por cache warming
   */
  calculateTilesIntersectingPolygon(
    poligono: ICoordenadas[],
    zoom: number,
  ): ITile[] {
    if (!poligono || poligono.length < 3) {
      this.logger.warn('Polígono inválido o con menos de 3 puntos');
      return [];
    }

    // 1. Calcular bounding box del polígono
    const bounds = this.calculatePolygonBounds(poligono);

    // 2. Aplicar buffer fijo pequeño para garantizar cobertura en los bordes
    const bufferedBounds = this.applyFixedBuffer(bounds);

    // 3. Convertir bounding box a coordenadas de tiles usando el sistema estándar XYZ
    const minTileX = Math.floor(
      ((bufferedBounds.minLng + 180) / 360) * Math.pow(2, zoom),
    );
    const maxTileX = Math.floor(
      ((bufferedBounds.maxLng + 180) / 360) * Math.pow(2, zoom),
    );

    // Para Y, necesitamos Web Mercator projection (compatible con OpenLayers XYZ)
    const minTileY = Math.floor(
      ((1 -
        Math.asinh(Math.tan((bufferedBounds.maxLat * Math.PI) / 180)) /
          Math.PI) /
        2) *
        Math.pow(2, zoom),
    );
    const maxTileY = Math.floor(
      ((1 -
        Math.asinh(Math.tan((bufferedBounds.minLat * Math.PI) / 180)) /
          Math.PI) /
        2) *
        Math.pow(2, zoom),
    );

    // 4. Revisar cada tile en el bounding box para ver si intersecta con el polígono
    const intersectingTiles: ITile[] = [];

    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        if (
          x >= 0 &&
          y >= 0 &&
          x < Math.pow(2, zoom) &&
          y < Math.pow(2, zoom)
        ) {
          // Calcular esquinas del tile
          const tileBounds = this.getTileBounds(x, y, zoom);

          // Verificar si el tile intersecta con el polígono
          if (this.tileIntersectsPolygon(tileBounds, poligono)) {
            intersectingTiles.push({ x, y, z: zoom });
          }
        }
      }
    }

    this.logger.debug(
      `Calculados ${intersectingTiles.length} tiles para zoom ${zoom} usando sistema XYZ estándar`,
    );

    return intersectingTiles;
  }

  /**
   * Aplica un buffer fijo pequeño para garantizar cobertura en los bordes
   * Evita gaps pero no interfiere con el sistema de coordenadas de tiles
   */
  private applyFixedBuffer(bounds: ITileBounds): ITileBounds {
    // Buffer fijo muy pequeño solo para evitar problemas de precisión en los bordes
    // Independiente del zoom level
    const EDGE_BUFFER = 0.0001; // ~11 metros

    const bufferedBounds = {
      minLat: bounds.minLat - EDGE_BUFFER,
      maxLat: bounds.maxLat + EDGE_BUFFER,
      minLng: bounds.minLng - EDGE_BUFFER,
      maxLng: bounds.maxLng + EDGE_BUFFER,
    };

    // Asegurar que no excedamos los límites del mundo
    bufferedBounds.minLat = Math.max(-85.0511, bufferedBounds.minLat);
    bufferedBounds.maxLat = Math.min(85.0511, bufferedBounds.maxLat);
    bufferedBounds.minLng = Math.max(-180, bufferedBounds.minLng);
    bufferedBounds.maxLng = Math.min(180, bufferedBounds.maxLng);

    return bufferedBounds;
  }

  /**
   * Genera tiles usando bounding box simple (algoritmo del frontend original)
   * Usado como fallback o para compatibilidad
   */
  generateTilesForBounds(bounds: ITileBounds, zoom: number): ITile[] {
    const tiles: ITile[] = [];

    // Verificar si los bounds son válidos
    if (
      !bounds ||
      bounds.minLat === null ||
      bounds.maxLat === null ||
      bounds.minLng === null ||
      bounds.maxLng === null
    ) {
      this.logger.warn('Bounds inválidos, no se pueden generar tiles');
      return tiles;
    }

    // Aplicar buffer fijo pequeño para evitar gaps en los bordes
    const bufferedBounds = this.applyFixedBuffer(bounds);

    // Convertir coordenadas geográficas a coordenadas de tile usando sistema XYZ estándar
    const minTileX = this.lngToTileX(bufferedBounds.minLng, zoom);
    const maxTileX = this.lngToTileX(bufferedBounds.maxLng, zoom);
    const minTileY = this.latToTileY(bufferedBounds.maxLat, zoom); // Nota: Y invertido
    const maxTileY = this.latToTileY(bufferedBounds.minLat, zoom);

    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        tiles.push({ x, y, z: zoom });
      }
    }

    this.logger.debug(
      `Generados ${tiles.length} tiles para bounds usando sistema XYZ estándar en zoom ${zoom}`,
    );

    return tiles;
  }

  /**
   * Calcula el bounding box de múltiples polígonos (para establecimientos)
   */
  calculateEstablecimientosBounds(
    ubicaciones: Array<{ poligono: ICoordenadas[] }>,
  ): ITileBounds {
    if (!ubicaciones || ubicaciones.length === 0) {
      return null;
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    ubicaciones.forEach((ubicacion) => {
      if (ubicacion.poligono && ubicacion.poligono.length > 0) {
        const bounds = this.calculatePolygonBounds(ubicacion.poligono);
        minLat = Math.min(minLat, bounds.minLat);
        maxLat = Math.max(maxLat, bounds.maxLat);
        minLng = Math.min(minLng, bounds.minLng);
        maxLng = Math.max(maxLng, bounds.maxLng);
      }
    });

    if (minLat === Infinity) {
      return null;
    }

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Extrae ubicaciones con polígonos de establecimientos (método unificado)
   * Maneja tanto formato poligono directo como GeoJSON
   */
  extractUbicacionesFromEstablecimientos(
    establecimientos: any[],
  ): Array<{ poligono: ICoordenadas[] }> {
    const ubicaciones = [];

    establecimientos.forEach((est) => {
      if (est.ubicacion?.length > 0) {
        est.ubicacion.forEach((ubicacion: any) => {
          // Extraer coordenadas del polígono
          let poligono: ICoordenadas[] = [];

          if (ubicacion.poligono?.length > 0) {
            // Usar poligono directo (formato ICoordenadas[])
            poligono = ubicacion.poligono.map((coord: any) => ({
              lat: coord.lat,
              lng: coord.lng,
            }));
          } else if (ubicacion.geojson?.coordinates?.[0]) {
            // Convertir de GeoJSON (lng,lat) a ICoordenadas (lat,lng)
            poligono = ubicacion.geojson.coordinates[0].map(
              (coord: number[]) => ({
                lat: coord[1],
                lng: coord[0],
              }),
            );
          }

          // Verificar que tenemos polígono válido
          if (poligono.length >= 3) {
            ubicaciones.push({ poligono });
          }
        });
      }
    });

    return ubicaciones;
  }

  /**
   * Calcula el bounding box (min/max lat/lng) de un polígono
   */
  private calculatePolygonBounds(poligono: ICoordenadas[]): ITileBounds {
    let minLat = poligono[0].lat;
    let maxLat = poligono[0].lat;
    let minLng = poligono[0].lng;
    let maxLng = poligono[0].lng;

    poligono.forEach((coord) => {
      minLat = Math.min(minLat, coord.lat);
      maxLat = Math.max(maxLat, coord.lat);
      minLng = Math.min(minLng, coord.lng);
      maxLng = Math.max(maxLng, coord.lng);
    });

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Calcula las coordenadas geográficas de las esquinas de un tile
   */
  private getTileBounds(x: number, y: number, zoom: number): ITileBounds {
    const n = Math.pow(2, zoom);

    const minLng = (x / n) * 360 - 180;
    const maxLng = ((x + 1) / n) * 360 - 180;

    const minLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
    const maxLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));

    const minLat = (minLatRad * 180) / Math.PI;
    const maxLat = (maxLatRad * 180) / Math.PI;

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Determina si un tile (rectángulo) intersecta con un polígono
   */
  public tileIntersectsPolygon(
    tileBounds: ITileBounds,
    poligono: ICoordenadas[],
  ): boolean {
    // Convertir tile a rectángulo (4 esquinas)
    const tileCorners: ICoordenadas[] = [
      { lat: tileBounds.minLat, lng: tileBounds.minLng },
      { lat: tileBounds.minLat, lng: tileBounds.maxLng },
      { lat: tileBounds.maxLat, lng: tileBounds.maxLng },
      { lat: tileBounds.maxLat, lng: tileBounds.minLng },
    ];

    // 1. Verificar si alguna esquina del tile está dentro del polígono
    for (const corner of tileCorners) {
      if (this.pointInPolygon(corner, poligono)) {
        return true;
      }
    }

    // 2. Verificar si alguna esquina del polígono está dentro del tile
    for (const vertex of poligono) {
      if (
        vertex.lat >= tileBounds.minLat &&
        vertex.lat <= tileBounds.maxLat &&
        vertex.lng >= tileBounds.minLng &&
        vertex.lng <= tileBounds.maxLng
      ) {
        return true;
      }
    }

    // 3. Verificar si hay intersección de bordes (tile vs polígono)
    return this.edgesIntersect(tileCorners, poligono);
  }

  /**
   * Algoritmo ray casting para determinar si un punto está dentro de un polígono
   */
  private pointInPolygon(
    point: ICoordenadas,
    polygon: ICoordenadas[],
  ): boolean {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (
        polygon[i].lat > point.lat !== polygon[j].lat > point.lat &&
        point.lng <
          ((polygon[j].lng - polygon[i].lng) * (point.lat - polygon[i].lat)) /
            (polygon[j].lat - polygon[i].lat) +
            polygon[i].lng
      ) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Verifica si los bordes de dos polígonos se intersectan
   */
  private edgesIntersect(
    poly1: ICoordenadas[],
    poly2: ICoordenadas[],
  ): boolean {
    for (let i = 0; i < poly1.length; i++) {
      const p1 = poly1[i];
      const p2 = poly1[(i + 1) % poly1.length];

      for (let j = 0; j < poly2.length; j++) {
        const p3 = poly2[j];
        const p4 = poly2[(j + 1) % poly2.length];

        if (this.lineSegmentsIntersect(p1, p2, p3, p4)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Determina si dos segmentos de línea se intersectan
   */
  private lineSegmentsIntersect(
    p1: ICoordenadas,
    p2: ICoordenadas,
    p3: ICoordenadas,
    p4: ICoordenadas,
  ): boolean {
    const d1 = this.direction(p3, p4, p1);
    const d2 = this.direction(p3, p4, p2);
    const d3 = this.direction(p1, p2, p3);
    const d4 = this.direction(p1, p2, p4);

    if (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    ) {
      return true;
    }

    // Casos especiales para puntos colineales
    if (d1 === 0 && this.onSegment(p3, p1, p4)) return true;
    if (d2 === 0 && this.onSegment(p3, p2, p4)) return true;
    if (d3 === 0 && this.onSegment(p1, p3, p2)) return true;
    if (d4 === 0 && this.onSegment(p1, p4, p2)) return true;

    return false;
  }

  /**
   * Calcula la dirección del giro de tres puntos
   */
  private direction(
    pi: ICoordenadas,
    pj: ICoordenadas,
    pk: ICoordenadas,
  ): number {
    return (
      (pk.lng - pi.lng) * (pj.lat - pi.lat) -
      (pj.lng - pi.lng) * (pk.lat - pi.lat)
    );
  }

  /**
   * Verifica si el punto q está en el segmento pr
   */
  private onSegment(
    p: ICoordenadas,
    q: ICoordenadas,
    r: ICoordenadas,
  ): boolean {
    return (
      q.lat <= Math.max(p.lat, r.lat) &&
      q.lat >= Math.min(p.lat, r.lat) &&
      q.lng <= Math.max(p.lng, r.lng) &&
      q.lng >= Math.min(p.lng, r.lng)
    );
  }

  /**
   * Métodos de conversión de coordenadas (compatibilidad con frontend)
   */
  private lngToTileX(lng: number, zoom: number): number {
    return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  }

  private latToTileY(lat: number, zoom: number): number {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * Math.pow(2, zoom),
    );
  }

  /**
   * Calcula tiles para un área rectangular (viewport)
   * Método simplificado para viewport-based requests
   */
  calculateTilesForBounds(
    bounds: {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    },
    zoom: number,
  ): ITile[] {
    const tiles: ITile[] = [];

    // Convertir coordenadas geográficas a coordenadas de tile
    const minTileX = this.lngToTileX(bounds.minLng, zoom);
    const maxTileX = this.lngToTileX(bounds.maxLng, zoom);
    const minTileY = this.latToTileY(bounds.maxLat, zoom); // Nota: Y invertido
    const maxTileY = this.latToTileY(bounds.minLat, zoom);

    // Validar que las coordenadas de tiles estén en rango válido
    const maxTileCoord = Math.pow(2, zoom) - 1;

    for (
      let x = Math.max(0, minTileX);
      x <= Math.min(maxTileCoord, maxTileX);
      x++
    ) {
      for (
        let y = Math.max(0, minTileY);
        y <= Math.min(maxTileCoord, maxTileY);
        y++
      ) {
        tiles.push({ x, y, z: zoom });
      }
    }

    this.logger.debug(
      `Calculados ${tiles.length} tiles para bounds [${bounds.minLat.toFixed(4)}, ${bounds.minLng.toFixed(4)}, ${bounds.maxLat.toFixed(4)}, ${bounds.maxLng.toFixed(4)}] zoom ${zoom}`,
    );

    return tiles;
  }
}
