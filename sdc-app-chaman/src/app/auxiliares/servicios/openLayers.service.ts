import { Injectable } from '@angular/core';
import { ICoordenadas, IGeoJSONPolygon } from 'modelos/src';
import { Feature } from 'ol';
import { Coordinate } from 'ol/coordinate';
import { LineString } from 'ol/geom';
import { defaults as defaultInteractions, MouseWheelZoom } from 'ol/interaction';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat, transform } from 'ol/proj';
import { OSM, Vector, XYZ } from 'ol/source';
import VectorSource from 'ol/source/Vector';
import { getLength } from 'ol/sphere';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import { FlatStyleLike } from 'ol/style/flat';
import Icon from 'ol/style/Icon';
import Stroke from 'ol/style/Stroke';
import Style, { StyleLike } from 'ol/style/Style';
import Text from 'ol/style/Text';

@Injectable({ providedIn: 'root' })
export class OpenLayersService {
  public static mapTile() {
    return new TileLayer({
      source: new OSM(),
    });
  }

  public static mapTileSatelite(maxZoom = 15) {
    return new TileLayer({
      source: new OSM({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: '',
        maxZoom,
      }),
    });
  }

  public static mapReferenciasPoliticas() {
    return new TileLayer({
      source: new XYZ({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        attributions: '',
        maxZoom: 19,
      }),
    });
  }

  public static mapSuelos() {
    return new TileLayer({
      source: new XYZ({
        url: 'http://localhost:8080/data/suelos-11-08-2025/{z}/{x}/{y}.pbf',
        attributions: '',
        maxZoom: 19,
      }),
    });
  }

  public static drawVectorLayer() {
    return new VectorLayer({
      source: new VectorSource({ wrapX: false }),
      style: new Style({
        stroke: new Stroke({
          color: 'blue',
          width: 3,
        }),
        fill: new Fill({
          color: 'rgba(0, 0, 255, 0.1)',
        }),
      }),
    });
  }

  public static styles: { [tipo: string]: StyleLike | FlatStyleLike } = {
    Point: {
      'circle-radius': 5,
      'circle-fill-color': 'red',
    },
    LineString: {
      'circle-radius': 4,
      'circle-fill-color': 'red',
      'stroke-color': 'black',
      'stroke-width': 3,
    },
    Polygon: {
      'circle-radius': 5,
      'circle-fill-color': 'red',
      'stroke-color': 'yellow',
      'stroke-width': 2,
      'fill-color': 'rgba(0, 0, 255, 0.1)',
    },
    Circle: {
      'circle-radius': 5,
      'circle-fill-color': 'red',
      'stroke-color': 'blue',
      'stroke-width': 2,
      'fill-color': 'yellow',
    },
  };

  public static polylineVectorLayer() {
    return new VectorLayer({
      source: new Vector(),
      style: new Style({
        stroke: new Stroke({
          color: 'blue',
          width: 4,
        }),
      }),
    });
  }

  public static circleVectorLayer() {
    return new VectorLayer({
      source: new Vector(),
      style: new Style({
        fill: new Fill({
          color: 'rgba(0, 255, 76, 0.1)',
        }),
        stroke: new Stroke({
          color: 'green',
          width: 3,
        }),
      }),
    });
  }

  public static polygonsVectorLayer() {
    return new VectorLayer({
      source: new Vector(),
      style: new Style({
        fill: new Fill({
          color: 'rgba(0, 0, 255, 0.1)',
        }),
        stroke: new Stroke({
          color: 'green',
          width: 3,
        }),
      }),
    });
  }

  public static pointsVectorLayer() {
    return new VectorLayer({
      source: new Vector(),
      style: new Style({
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({ color: 'red' }),
          stroke: new Stroke({
            color: 'white',
            width: 2,
          }),
        }),
      }),
    });
  }

  public static pinSvg = `<svg fill="#ff1a1a" width="800px" height="800px" viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg">
<title>pin</title>
<path d="M4 12q0-3.264 1.6-6.016t4.384-4.352 6.016-1.632 6.016 1.632 4.384 4.352 1.6 6.016q0 1.376-0.672 3.2t-1.696 3.68-2.336 3.776-2.56 3.584-2.336 2.944-1.728 2.080l-0.672 0.736q-0.256-0.256-0.672-0.768t-1.696-2.016-2.368-3.008-2.528-3.52-2.368-3.84-1.696-3.616-0.672-3.232zM8 12q0 3.328 2.336 5.664t5.664 2.336 5.664-2.336 2.336-5.664-2.336-5.632-5.664-2.368-5.664 2.368-2.336 5.632z"></path>
</svg>`;

  public static svgDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(OpenLayersService.pinSvg);

  public static pointsSVGVectorLayer() {
    return new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        image: new Icon({
          src: OpenLayersService.svgDataUrl,
          scale: 32 / 800, // reduce de 800px a 32px
          anchor: [0.5, 1], // horizontal center, vertical bottom (punta del pin)
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
        }),
      }),
    });
  }

  public static distribuidorSvg = `<svg fill="#007bff" width="35px" height="35px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<circle cx="12" cy="12" r="10" fill="#007bff" stroke="#fff" stroke-width="2"/>
<text x="12" y="16" font-family="Arial" font-size="14" font-weight="bold" fill="#fff" text-anchor="middle">D</text>
</svg>`;

  public static distribuidorSvgDataUrl =
    'data:image/svg+xml;utf8,' + encodeURIComponent(OpenLayersService.distribuidorSvg);

  public static distribuidorVectorLayer() {
    return new VectorLayer({
      source: new VectorSource(),
      zIndex: 10, // Z-index alto para que se muestre por encima
      style: (feature) => {
        return new Style({
          image: new Icon({
            src: './images/pins/distribuidor.png', // Ruta relativa desde public
            anchor: [0.5, 0.5], // Centro del pin circular
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            height: 30,
            width: 30,
          }),
          text: new Text({
            text: feature.get('name') || '',
            font: 'bold 12px sans-serif',
            fill: new Fill({ color: '#000' }),
            stroke: new Stroke({ color: '#fff', width: 3 }),
            offsetY: -20, // Posicionar texto arriba del ícono
            textAlign: 'center',
            textBaseline: 'middle',
          }),
        });
      },
    });
  }

  public static createTextStyle(feature: Feature, color: string = '#000', background: string = '#fff'): Style {
    return new Style({
      text: new Text({
        text: feature.get('name') || '',
        font: '12px sans-serif',
        fill: new Fill({ color }),
        stroke: new Stroke({ color: background, width: 3 }),
        offsetY: -15,
      }),
    });
  }

  public static pinConTextStyle(feature: Feature, color: string = '#000', background: string = '#fff'): Style {
    return new Style({
      image: new Icon({
        src: OpenLayersService.svgDataUrl,
        scale: 32 / 800, // reduce de 800px a 32px
        anchor: [0.5, 1], // horizontal center, vertical bottom (punta del pin)
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
      text: new Text({
        text: feature.get('name') || '',
        font: '12px sans-serif',
        fill: new Fill({ color }),
        stroke: new Stroke({ color: background, width: 3 }),
        offsetY: -15,
      }),
    });
  }

  public static poligonosConTextStyle(feature: Feature): Style {
    return new Style({
      fill: new Fill({
        color: 'rgba(0, 123, 255, 0.2)',
      }),
      stroke: new Stroke({
        color: '#007bff',
        width: 2,
      }),
      text: new Text({
        text: feature.get('name') || '',
        font: '12px sans-serif',
        fill: new Fill({ color: '#000' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        overflow: true,
      }),
    });
  }

  public static lineasConTextStyle(feature: Feature): Style {
    return new Style({
      stroke: new Stroke({
        color: '#28a745',
        width: 3,
      }),
      text: new Text({
        text: feature.get('name') || '',
        font: '12px sans-serif',
        fill: new Fill({ color: '#000' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        offsetY: -10,
      }),
    });
  }

  public static wheelInteraction() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = (e: any) => {
      if (e.type === 'wheel' && e.originalEvent.ctrlKey) {
        return true;
      }
      return false;
    };

    const mouseWheelOptions = new MouseWheelZoom({
      condition: f,
    });

    return mouseWheelOptions;
  }

  public static interactions() {
    return defaultInteractions({
      mouseWheelZoom: false,
      doubleClickZoom: false,
    }).extend([OpenLayersService.wheelInteraction()]);
  }

  constructor() {}

  public static async getCurrentPosition(): Promise<Coordinate> {
    return new Promise((resolve) => {
      const ubicacionBase = OpenLayersService.lonLatToCoordinate(-58.0128784, -35.5836812);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const ubicacion = OpenLayersService.lonLatToCoordinate(position.coords.longitude, position.coords.latitude);
            resolve(ubicacion);
          },
          () => {
            console.warn('Ubicacion no aceptada');
            resolve(ubicacionBase);
          },
          {
            timeout: 5000,
            enableHighAccuracy: true,
          }
        );
      } else {
        resolve(ubicacionBase);
      }
    });
  }

  public static async getCurrentPositionGeoJSON(): Promise<Coordinate> {
    return new Promise((resolve) => {
      const ubicacionBase = [-58.0128784, -35.5836812];
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const ubicacion = [position.coords.longitude, position.coords.latitude];
            resolve(ubicacion);
          },
          () => {
            console.warn('Ubicacion no aceptada');
            resolve(ubicacionBase);
          },
          {
            timeout: 5000,
            enableHighAccuracy: true,
          }
        );
      } else {
        resolve(ubicacionBase);
      }
    });
  }

  public static lonLatToCoordinate(lon: number, lat: number): Coordinate {
    const coord = fromLonLat([lon, lat]);
    return coord;
  }

  public static distanceBetweenPoints(p1: Coordinate, p2: Coordinate): number {
    return getLength(new LineString([p1, p2]));
  }

  public static leastDistanceFromLineString(c: Coordinate, line: Coordinate[]) {
    const ls = new LineString(line);
    const cp = ls.getClosestPoint(c);
    const distance = OpenLayersService.distanceBetweenPoints(c, cp);
    return distance;
  }

  public static cordinateToGeoJSONPoint(coord: Coordinate): {
    type: 'Point';
    coordinates: [number, number];
  } {
    coord = transform(coord, 'EPSG:3857', 'EPSG:4326');
    return {
      type: 'Point',
      coordinates: [coord[0], coord[1]],
    };
  }

  public static cordinatesToGeoJSONLineString(coords: Coordinate[]): {
    type: 'LineString';
    coordinates: [number, number][];
  } {
    const coordinates: [number, number][] = coords.map((coord) => {
      coord = transform(coord, 'EPSG:3857', 'EPSG:4326');
      return [coord[0], coord[1]];
    });
    return {
      type: 'LineString',
      coordinates,
    };
  }

  public static cordinatesToGeoJSONPolygon(coords: Coordinate[]): IGeoJSONPolygon {
    const coordinates: [number, number][] = coords.map((coord) => {
      coord = transform(coord, 'EPSG:3857', 'EPSG:4326');
      return [coord[0], coord[1]];
    });

    return {
      type: 'Polygon',
      coordinates: [coordinates],
    };
  }

  public static polylineToCoordinates(polyline: [number, number][]): Coordinate[] {
    return polyline.map((p) => fromLonLat(p));
  }

  public static polygonToCoordinates(polygon: [[number, number][]]): Coordinate[][] {
    return polygon.map((p) => p.map((c) => fromLonLat(c)));
  }

  public static coordinateToCoordenada(c?: Coordinate): ICoordenadas | null {
    if (!c) return null;
    const coord = transform(c, 'EPSG:3857', 'EPSG:4326');
    return { lat: coord[1], lng: coord[0] };
  }

  public static geoJSONToCoordenadas(geojson: IGeoJSONPolygon): ICoordenadas[] {
    if (geojson.type !== 'Polygon' || !geojson.coordinates) {
      return [];
    }
    return geojson.coordinates[0]
      .map((c) => OpenLayersService.coordinateToCoordenada(fromLonLat(c)))
      .filter((coord): coord is ICoordenadas => coord !== null);
  }
}
