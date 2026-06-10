// GEOJSON
// https://www.mongodb.com/docs/manual/reference/geojson/
// type es el tipo de objeto a guardar
//  Point LineString  Polygon  MultiPoint  MultiLineString  MultiPolygon  GeometryCollection

export interface IGeoJSONPoint {
  type: 'Point';
  coordinates?: [number, number];
}

export interface IGeoJSONCircle {
  type: 'Point';
  coordinates?: [number, number];
  radius?: number;
}

export interface IGeoJSONLineString {
  type: 'LineString';
  coordinates?: [number, number][];
}

export interface IGeoJSONPolygon {
  type: 'Polygon';
  coordinates?: [[number, number][]];
}

export interface IGeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates?: number[][][][];
}
