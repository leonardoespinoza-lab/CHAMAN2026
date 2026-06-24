import json
import os
from functools import lru_cache
from typing import Dict, Optional, Union

import rasterio
from pyproj import CRS, Transformer
from rasterio.coords import BoundingBox
from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import transform as shapely_transform

# Caché para transformers de reproyección
_TRANSFORMER_CACHE: Dict[tuple, Transformer] = {}

# Tipo para geometrías (puede ser lista de coordenadas o GeoJSON)
GeometryInput = Union[list, dict, Polygon]


@lru_cache(maxsize=128)
def _get_transformer(from_crs: str, to_crs: str) -> Transformer:
    """Obtiene un transformer de pyproj con caché para mejor performance."""
    cache_key = (from_crs, to_crs)
    if cache_key not in _TRANSFORMER_CACHE:
        _TRANSFORMER_CACHE[cache_key] = Transformer.from_crs(
            from_crs, to_crs, always_xy=True
        )
    return _TRANSFORMER_CACHE[cache_key]


def _ensure_polygon(geometry: GeometryInput) -> Polygon:
    """
    Convierte cualquier input válido a un objeto Polygon de Shapely.

    Args:
        geometry: Puede ser:
            - Lista de coordenadas [[x1,y1], [x2,y2], ...]
            - Diccionario GeoJSON
            - Objeto Polygon de Shapely

    Returns:
        Polygon: Objeto Polygon válido

    Raises:
        ValueError: Si la geometría no es un polígono válido
    """
    if isinstance(geometry, Polygon):
        return geometry
    if isinstance(geometry, dict):
        geom = shape(geometry)
        if not isinstance(geom, Polygon):
            raise ValueError("El GeoJSON debe contener un Polygon")
        return geom
    if isinstance(geometry, list):
        return Polygon(geometry)
    raise TypeError(f"Tipo de geometría no soportado: {type(geometry)}")


def obtener_metadata_png_con_polygon(tif_path: str, polygon: GeometryInput) -> dict:
    """
    Obtiene metadata de un GeoTIFF y el bounding box del polígono en EPSG:4326.

    Args:
        tif_path: Ruta al archivo GeoTIFF
        polygon: Polígono en formato GeoJSON, lista de coordenadas o objeto Polygon

    Returns:
        dict: Metadata con:
            - width: Ancho en píxeles
            - height: Alto en píxeles
            - crs: Sistema de referencia
            - bounds: Bounding box original
            - geojson: Bounding box en GeoJSON (EPSG:4326)

    Raises:
        ValueError: Si el archivo TIFF no existe o es inválido
        RuntimeError: Si falla la reproyección
    """
    if not os.path.exists(tif_path):
        raise ValueError(f"El archivo TIFF no existe: {tif_path}")

    polygon_obj = _ensure_polygon(polygon)

    with rasterio.open(tif_path) as src:
        # Validar CRS del raster
        if not src.crs:
            raise ValueError("El TIFF no tiene sistema de referencia definido")

        raster_crs = CRS.from_user_input(src.crs)
        epsg_code = raster_crs.to_epsg()
        metadata = {
            "width": src.width,
            "height": src.height,
            "crs": f"EPSG:{epsg_code}" if epsg_code else str(raster_crs),
            "bounds": src.bounds,
        }

        # Reprojectar el polígono al CRS del raster si es necesario
        if epsg_code != 4326:
            try:
                transformer = _get_transformer("EPSG:4326", str(raster_crs))
                polygon_proj = shapely_transform(transformer.transform, polygon_obj)
            except Exception as e:
                raise RuntimeError(f"Error reproyectando polígono: {str(e)}")
        else:
            polygon_proj = polygon_obj

        # Obtener bbox en CRS del raster
        raster_bbox = src.bounds

        # Convertir bbox a EPSG:4326 si es necesario
        if epsg_code != 4326:
            try:
                reverse_transformer = _get_transformer(str(raster_crs), "EPSG:4326")
                bbox_epsg4326 = shapely_transform(
                    reverse_transformer.transform, box(*raster_bbox)
                )
            except Exception as e:
                raise RuntimeError(f"Error reproyectando bbox: {str(e)}")
        else:
            bbox_epsg4326 = box(*raster_bbox)

        # Formatear como GeoJSON
        metadata["geojson"] = {
            "type": "Polygon",
            "coordinates": [list(bbox_epsg4326.exterior.coords)],
        }

        return metadata


def scene_cubre_poligono(tif_path: str, polygon: GeometryInput) -> bool:
    """
    Verifica si un polígono está completamente contenido en el área de un raster.

    Args:
        tif_path: Ruta al archivo GeoTIFF
        polygon: Polígono en cualquier formato válido

    Returns:
        bool: True si el polígono está completamente contenido

    Raises:
        ValueError: Si el archivo no existe o es inválido
    """
    if not os.path.exists(tif_path):
        raise ValueError(f"El archivo TIFF no existe: {tif_path}")

    polygon_obj = _ensure_polygon(polygon)

    with rasterio.open(tif_path) as src:
        # Crear polígono del área del raster
        raster_bounds = src.bounds
        raster_polygon = box(
            raster_bounds.left,
            raster_bounds.bottom,
            raster_bounds.right,
            raster_bounds.top,
        )

        # Reprojectar el polígono de entrada si es necesario
        if src.crs and CRS.from_user_input(src.crs).to_epsg() != 4326:
            transformer = _get_transformer("EPSG:4326", str(src.crs))
            polygon_proj = shapely_transform(transformer.transform, polygon_obj)
        else:
            polygon_proj = polygon_obj

        return raster_polygon.contains(polygon_proj)


def obtener_bbox_escena(
    tif_path: str, target_crs: str = "EPSG:4326"
) -> Optional[BoundingBox]:
    """
    Obtiene el bounding box de una escena en el CRS especificado.

    Args:
        tif_path: Ruta al archivo TIFF
        target_crs: CRS de destino (por defecto EPSG:4326)

    Returns:
        BoundingBox: Bbox en el CRS solicitado o None si falla
    """
    try:
        with rasterio.open(tif_path) as src:
            src_crs = str(src.crs) if src.crs else "EPSG:4326"

            if src_crs == target_crs:
                return src.bounds

            transformer = _get_transformer(src_crs, target_crs)
            minx, miny = transformer.transform(src.bounds.left, src.bounds.bottom)
            maxx, maxy = transformer.transform(src.bounds.right, src.bounds.top)

            return BoundingBox(minx, miny, maxx, maxy)
    except Exception:
        return None


def guardar_geojson(geometry: GeometryInput, file_path: str):
    """Guarda una geometría como archivo GeoJSON."""
    polygon = _ensure_polygon(geometry)
    geojson = {"type": "Feature", "geometry": mapping(polygon), "properties": {}}
    with open(file_path, "w") as f:
        json.dump(geojson, f)


def cargar_geojson(file_path: str) -> Polygon:
    """Carga un polígono desde un archivo GeoJSON."""
    with open(file_path) as f:
        data = json.load(f)
    return _ensure_polygon(data["geometry"])
