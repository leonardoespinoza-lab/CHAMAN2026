import logging
import os
from typing import Optional, Tuple

import numpy as np
import rasterio
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image, ImageFilter
from rasterio.mask import mask
from shapely.geometry import Polygon, mapping

logger = logging.getLogger(__name__)


def _png_scale() -> int:
    try:
        return max(1, int(os.getenv("NDVI_PNG_SCALE", "3")))
    except ValueError:
        logger.warning("NDVI_PNG_SCALE invalido; usando 3")
        return 3


NDVI_PNG_SCALE = _png_scale()

NDVI_CMAP = LinearSegmentedColormap.from_list(
    "ndvi",
    [
        (0.0, "#000080"),
        (0.4, "#4682B4"),
        (0.5, "#A0522D"),
        (0.55, "#D2B48C"),
        (0.6, "#FFFFE0"),
        (0.7, "#9ACD32"),
        (0.85, "#008000"),
        (1.0, "#006400"),
    ],
)

INDEX_CMAPS = {
    "ndvi": NDVI_CMAP,
    "savi": NDVI_CMAP,
    "evi": NDVI_CMAP,
    "ndmi": LinearSegmentedColormap.from_list(
        "ndmi",
        [
            (0.0, "#8a4f2a"),
            (0.42, "#e6c68f"),
            (0.55, "#f2f7f5"),
            (0.72, "#69c7c4"),
            (1.0, "#0b678f"),
        ],
    ),
    "ndwi": LinearSegmentedColormap.from_list(
        "ndwi",
        [
            (0.0, "#8b5a2b"),
            (0.45, "#efe0b5"),
            (0.6, "#d8f2ef"),
            (0.82, "#4bb8d8"),
            (1.0, "#0d5aa7"),
        ],
    ),
    "ndre": LinearSegmentedColormap.from_list(
        "ndre",
        [
            (0.0, "#d0a15f"),
            (0.38, "#efe9aa"),
            (0.58, "#8ed36d"),
            (0.78, "#31a354"),
            (1.0, "#0b5d2a"),
        ],
    ),
}


def recortar_ndvi(ndvi_tif_path: str, polygon: Polygon, output_tif_path: str):
    """Recorta un GeoTIFF usando el poligono del lote."""
    try:
        with rasterio.open(ndvi_tif_path) as src:
            dtype = src.meta.get("dtype", "uint16")
            nodata = 0 if dtype == "uint16" else np.nan
            geom_reproj = _reproject_geom(polygon, "EPSG:4326", src.crs)
            out_image, out_transform = mask(
                src, [mapping(geom_reproj)], crop=True, nodata=nodata, all_touched=True
            )
            out_meta = src.meta.copy()
            out_meta.update(
                {
                    "height": out_image.shape[1],
                    "width": out_image.shape[2],
                    "transform": out_transform,
                    "nodata": nodata,
                }
            )
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
    """Exporta un PNG NDVI a partir de un GeoTIFF y el poligono del lote."""
    if not os.path.exists(tif_path):
        raise FileNotFoundError(f"Archivo TIFF no encontrado: {tif_path}")

    try:
        with rasterio.open(tif_path) as src:
            geom_reproj = _reproject_geom(polygon, "EPSG:4326", src.crs)
            ndvi_array, _ = mask(
                src, [mapping(geom_reproj)], crop=True, filled=True, nodata=np.nan
            )
        _guardar_png_indexado(ndvi_array[0], output_png_path, "ndvi", dpi, quality)
        return output_png_path
    except Exception as e:
        raise RuntimeError(f"Error al exportar PNG: {str(e)}")


def exportar_png_desde_array(
    array: np.ndarray,
    output_png_path: str,
    indice: str = "ndvi",
    dpi: int = 300,
    quality: int = 90,
) -> str:
    """Exporta un raster de indice ya recortado a PNG interpretable."""
    _guardar_png_indexado(array, output_png_path, indice, dpi, quality)
    return output_png_path


def _guardar_png_indexado(
    values: np.ndarray,
    output_png_path: str,
    indice: str,
    dpi: int,
    quality: int,
) -> None:
    values = np.clip(values.astype("float32"), -1, 1)
    normalized = (values + 1) / 2
    cmap = INDEX_CMAPS.get(indice, NDVI_CMAP)
    rgba = (cmap(normalized) * 255).astype(np.uint8)
    rgba[..., 3] = np.where(np.isnan(values), 0, 255)

    img = Image.fromarray(rgba, mode="RGBA")
    img = _agregar_contorno_transparente(img)
    if NDVI_PNG_SCALE > 1:
        img = img.resize(
            (img.width * NDVI_PNG_SCALE, img.height * NDVI_PNG_SCALE),
            Image.Resampling.BICUBIC,
        )
    img.save(output_png_path, dpi=(dpi, dpi), quality=quality)


def _agregar_contorno_transparente(img: Image.Image) -> Image.Image:
    """Agrega un borde sutil al area valida del recorte."""
    alpha = img.getchannel("A")
    borde = alpha.filter(ImageFilter.FIND_EDGES).point(lambda p: 150 if p else 0)
    capa_borde = Image.new("RGBA", img.size, (37, 50, 73, 0))
    capa_borde.putalpha(borde)
    return Image.alpha_composite(capa_borde, img)


def _reproject_geom(geom: Polygon, from_crs: str, to_crs: str) -> Polygon:
    """Reproyecta una geometria entre sistemas de coordenadas."""
    if from_crs == to_crs:
        return geom

    import pyproj

    transformer = pyproj.Transformer.from_crs(from_crs, to_crs, always_xy=True)
    return Polygon([transformer.transform(x, y) for x, y in geom.exterior.coords])


def calcular_promedio_ndvi(tif_path: str) -> Optional[float]:
    """Calcula el valor promedio de NDVI en un TIFF."""
    try:
        with rasterio.open(tif_path) as src:
            array = src.read(1).astype(np.float32)
            if src.nodata is not None:
                array[array == src.nodata] = np.nan
        return float(np.nanmean(array))
    except Exception:
        return None


def obtener_geojson_valido(polygon_coords: list) -> dict:
    """Convierte coordenadas a una geometria GeoJSON valida."""
    return mapping(Polygon(polygon_coords))


def recortar(
    geotiff_path: str, polygon_coords: list
) -> Tuple[Optional[np.ndarray], Optional[dict]]:
    """Recorta un GeoTIFF usando coordenadas de poligono."""
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
