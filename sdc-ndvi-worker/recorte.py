import logging
import os
from typing import Optional, Tuple

import numpy as np
import rasterio
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image, ImageFilter
from rasterio.mask import mask
from shapely.geometry import Polygon, mapping

# Configuración del logging
logger = logging.getLogger(__name__)


def _png_scale() -> int:
    try:
        return max(1, int(os.getenv("NDVI_PNG_SCALE", "3")))
    except ValueError:
        logger.warning("NDVI_PNG_SCALE invalido; usando 3")
        return 3


NDVI_PNG_SCALE = _png_scale()

# Configuración del colormap NDVI
NDVI_CMAP = LinearSegmentedColormap.from_list(
    "ndvi",
    [
        # El rango de 0.0 a 0.5 representa el NDVI de -1.0 a 0.0
        (0.0, "#000080"),  # NDVI ~ -1.0 (Agua profunda y clara) -> Azul Marino
        (0.4, "#4682B4"),  # NDVI ~ -0.2 (Agua poco profunda, turbia) -> Azul Acero
        # El rango de 0.5 a 0.6 representa el NDVI de 0.0 a 0.2 (suelo)
        (0.5, "#A0522D"),  # NDVI = 0.0 (Línea de costa/suelo húmedo) -> Siena
        (0.55, "#D2B48C"),  # NDVI ~ 0.1 (Suelo desnudo y seco) -> Canela
        # El rango de 0.6 en adelante representa la vegetación
        (0.6, "#FFFFE0"),  # NDVI ~ 0.2 (Vegetación muy escasa) -> Amarillo Claro
        (0.7, "#9ACD32"),  # NDVI ~ 0.4 (Vegetación moderada) -> Verde Amarillento
        (0.85, "#008000"),  # NDVI ~ 0.7 (Vegetación saludable) -> Verde
        (1.0, "#006400"),  # NDVI = 1.0 (Vegetación muy densa/bosque) -> Verde Oscuro
    ],
)


def recortar_ndvi(ndvi_tif_path: str, polygon: Polygon, output_tif_path: str):
    """Recorta un archivo NDVI GeoTIFF usando un polígono Shapely."""
    try:
        with rasterio.open(ndvi_tif_path) as src:
            # Obtener dtype del metadata (no directamente de src)
            dtype = src.meta.get("dtype", "uint16")  # Default para Landsat

            # Definir nodata según el tipo de dato
            nodata = 0 if dtype == "uint16" else np.nan

            # Transformar el polígono al CRS del raster
            geom_reproj = _reproject_geom(polygon, "EPSG:4326", src.crs)

            # Recortar
            out_image, out_transform = mask(
                src, [mapping(geom_reproj)], crop=True, nodata=nodata, all_touched=True
            )

            # Actualizar metadatos
            out_meta = src.meta.copy()
            out_meta.update(
                {
                    "height": out_image.shape[1],
                    "width": out_image.shape[2],
                    "transform": out_transform,
                    "nodata": nodata,
                }
            )

            # Guardar
            with rasterio.open(output_tif_path, "w", **out_meta) as dest:
                dest.write(out_image)

        return output_tif_path

    except Exception as e:
        logger.error(f"Error en recortar_ndvi: {str(e)}")
        raise


def exportar_png_desde_tif_con_polygon(
    tif_path: str,
    output_png_path: str,
    polygon: Polygon,
    dpi: int = 300,
    quality: int = 90,
) -> str:
    """
    Exporta un PNG a partir de un GeoTIFF recortado por un polígono.

    Args:
        tif_path: Ruta al archivo TIFF
        output_png_path: Ruta de salida PNG
        polygon: Polígono Shapely en WGS84
        dpi: Resolución de la imagen
        quality: Calidad del PNG (1-100)

    Returns:
        str: Ruta al PNG generado
    """
    if not os.path.exists(tif_path):
        raise FileNotFoundError(f"Archivo TIFF no encontrado: {tif_path}")

    try:
        with rasterio.open(tif_path) as src:
            # Transformar y recortar
            geom_reproj = _reproject_geom(polygon, "EPSG:4326", src.crs)
            ndvi_array, _ = mask(
                src, [mapping(geom_reproj)], crop=True, filled=True, nodata=np.nan
            )
            ndvi = ndvi_array[0]

        # Procesamiento de la imagen
        ndvi = np.clip(ndvi, -1, 1)  # Asegurar rango válido
        ndvi_normalized = (ndvi + 1) / 2  # Normalizar a 0-1

        # Aplicar colormap
        rgba = (NDVI_CMAP(ndvi_normalized) * 255).astype(np.uint8)

        # Máscara de transparencia para valores NaN
        rgba[..., 3] = np.where(np.isnan(ndvi), 0, 255)

        # Guardar como PNG
        img = Image.fromarray(rgba, mode="RGBA")
        img = _agregar_contorno_transparente(img)
        if NDVI_PNG_SCALE > 1:
            img = img.resize(
                (img.width * NDVI_PNG_SCALE, img.height * NDVI_PNG_SCALE),
                Image.Resampling.BICUBIC,
            )
        img.save(output_png_path, dpi=(dpi, dpi), quality=quality)

        return output_png_path

    except Exception as e:
        raise RuntimeError(f"Error al exportar PNG: {str(e)}")


def _agregar_contorno_transparente(img: Image.Image) -> Image.Image:
    """Agrega un borde sutil al area valida del recorte para mejorar lectura en el front."""
    alpha = img.getchannel("A")
    borde = alpha.filter(ImageFilter.FIND_EDGES).point(lambda p: 150 if p else 0)
    capa_borde = Image.new("RGBA", img.size, (37, 50, 73, 0))
    capa_borde.putalpha(borde)
    return Image.alpha_composite(capa_borde, img)


def _reproject_geom(geom: Polygon, from_crs: str, to_crs: str) -> Polygon:
    """
    Reprojecta una geometría entre sistemas de coordenadas.

    Args:
        geom: Polígono a transformar
        from_crs: CRS de origen (ej. 'EPSG:4326')
        to_crs: CRS de destino

    Returns:
        Polygon: Polígono reproyectado
    """
    if from_crs == to_crs:
        return geom

    import pyproj

    transformer = pyproj.Transformer.from_crs(from_crs, to_crs, always_xy=True)
    return Polygon([transformer.transform(x, y) for x, y in geom.exterior.coords])


def calcular_promedio_ndvi(tif_path: str) -> Optional[float]:
    """
    Calcula el valor promedio de NDVI en un archivo TIFF.

    Args:
        tif_path: Ruta al archivo TIFF

    Returns:
        float: Valor promedio o None si falla
    """
    try:
        with rasterio.open(tif_path) as src:
            array = src.read(1).astype(np.float32)
            array[array == src.nodata] = np.nan
        return float(np.nanmean(array))
    except Exception:
        return None


def obtener_geojson_valido(polygon_coords: list) -> dict:
    """
    Convierte coordenadas a una geometría GeoJSON válida.

    Args:
        polygon_coords: Lista de coordenadas [[x,y], ...]

    Returns:
        dict: Geometría en formato GeoJSON
    """
    return mapping(Polygon(polygon_coords))


def recortar(
    geotiff_path: str, polygon_coords: list
) -> Tuple[Optional[np.ndarray], Optional[dict]]:
    """
    Recorta un GeoTIFF usando coordenadas de polígono.

    Args:
        geotiff_path: Ruta al GeoTIFF
        polygon_coords: Lista de coordenadas [[x,y], ...]

    Returns:
        tuple: (array de datos, metadatos) o (None, None) si falla
    """
    try:
        polygon = Polygon(polygon_coords)
        geojson_geom = [mapping(polygon)]

        with rasterio.open(geotiff_path) as src:
            out_image, out_transform = mask(src, geojson_geom, crop=True)
            out_meta = src.meta.copy()

        out_meta.update(
            {
                "height": out_image.shape[1],
                "width": out_image.shape[2],
                "transform": out_transform,
            }
        )

        return out_image, out_meta

    except Exception as e:
        print(f"Error al recortar: {str(e)}")
        return None, None
