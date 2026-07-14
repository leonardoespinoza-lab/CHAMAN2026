export interface IntaSoilLayerDefinition {
  id: string;
  endpoint: string;
  layerName: string;
  provinces: string[];
  scale: string;
  sourceVersion: string;
  crs: string;
  priority: number;
  geometryField: string;
  fields: {
    featureId?: string;
    texture?: string;
    series?: string;
    unitSymbol?: string;
    unitName?: string;
    unitType?: string;
    order?: string;
    suborder?: string;
    greatGroup?: string;
    subgroup?: string;
    drainage?: string;
    capability?: string;
    limitations?: string[];
    depth?: string;
  };
  attribution: string;
  license: string;
  metadataUrl: string;
}

const INTA_WFS_ENDPOINT = 'https://geo-backend.inta.gob.ar/geoserver/ows';

/**
 * Registro validado el 14-07-2026 mediante WFS GetCapabilities,
 * DescribeFeatureType y una muestra GetFeature por capa.
 */
export const INTA_SOIL_LAYERS: IntaSoilLayerDefinition[] = [
  {
    id: 'inta-ba-50k-v2',
    endpoint: INTA_WFS_ENDPOINT,
    layerName: 'geonode:Suelos_BA_50mil_V2',
    provinces: ['buenos aires'],
    scale: '1:50.000',
    sourceVersion: 'Suelos_BA_50mil_V2@2026-07-14',
    crs: 'EPSG:4326',
    priority: 100,
    geometryField: 'the_geom',
    fields: {
      featureId: 'OBJECTID_1',
      series: 'SERIE1',
      unitSymbol: 'SIMBC',
      unitName: 'Nombre_UC',
      unitType: 'TIPO',
      subgroup: 'taxo_ppal',
      capability: 'CAP_USO',
    },
    attribution: 'INTA Digital GEO',
    license: 'Consultar metadatos de la capa INTA antes de redistribuir',
    metadataUrl: 'https://geo.inta.gob.ar/',
  },
  {
    id: 'inta-jujuy-soils',
    endpoint: INTA_WFS_ENDPOINT,
    layerName: 'geonode:suelo_jujuy_pj4326',
    provinces: ['jujuy'],
    scale: 'regional',
    sourceVersion: 'suelo_jujuy_pj4326@2026-07-14',
    crs: 'EPSG:4326',
    priority: 90,
    geometryField: 'the_geom',
    fields: {
      featureId: 'id',
      texture: 'Taxonomia',
      unitSymbol: 'Simbolo',
      unitName: 'Unid_cart',
      subgroup: 'Taxonomia',
      capability: 'Capac_Uso',
    },
    attribution: 'INTA Digital GEO',
    license: 'Consultar metadatos de la capa INTA antes de redistribuir',
    metadataUrl: 'https://geo.inta.gob.ar/',
  },
  {
    id: 'inta-lerma-soils',
    endpoint: INTA_WFS_ENDPOINT,
    layerName: 'geonode:carta_suelos_valle_lerma_ll',
    provinces: ['salta'],
    scale: 'regional',
    sourceVersion: 'carta_suelos_valle_lerma_ll@2026-07-14',
    crs: 'EPSG:4326',
    priority: 85,
    geometryField: 'the_geom',
    fields: {
      featureId: 'gid',
      series: 'Suelo_1',
      unitSymbol: 'Nomencla',
      unitName: 'Nomb_',
      order: 'Orden',
      suborder: 'Suborden',
      greatGroup: 'Grangrup',
      subgroup: 'Subgr_USDA',
      capability: 'cap_uso',
    },
    attribution: 'INTA Digital GEO',
    license: 'Consultar metadatos de la capa INTA antes de redistribuir',
    metadataUrl: 'https://geo.inta.gob.ar/',
  },
  {
    id: 'inta-argentina-500k',
    endpoint: INTA_WFS_ENDPOINT,
    layerName: 'geonode:suelos_argentina_1_500',
    provinces: ['*'],
    scale: '1:500.000 / 1:1.000.000',
    sourceVersion: 'suelos_argentina_1_500@2026-07-14',
    crs: 'EPSG:4326',
    priority: 50,
    geometryField: 'the_geom',
    fields: {
      featureId: 'ogc_fid',
      texture: 'text_sups1',
      unitSymbol: 'simbc',
      unitType: 'tipo_uc',
      order: 'orden_sue1',
      greatGroup: 'ggrup_sue1',
      subgroup: 'sgrup_sue1',
      drainage: 'drenaje_s1',
      limitations: ['limit_ppal', 'limit_secu', 'limit_terc'],
      depth: 'profund_s1',
    },
    attribution: 'INTA Digital GEO · Atlas de Suelos de la República Argentina',
    license: 'Consultar metadatos de la capa INTA antes de redistribuir',
    metadataUrl: 'https://geo.inta.gob.ar/',
  },
];

export const INTA_LAYER_REGISTRY_VERSION = 'inta-soil-layers-2026-07-14-v1';
