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
        return max(1, int(os.getenv("NDVI_PNG_SCALE", "5")))
    except ValueError:
        logger.warning("NDVI_PNG_SCALE invalido; usando 5")
        return 5


NDVI_PNG_SCALE = _png_scale()

def _colormap_from_value_ramp(name: str, ramp: list[tuple[float, str]], vmin: float, vmax: float) -> LinearSegmentedColormap:
    scale = vmax - vmin
    return LinearSegmentedColormap.from_list(
        name,
        [(max(0.0, min(1.0, (value - vmin) / scale)), color) for value, color in ramp],
    )


VEGETATION_CMAP = _colormap_from_value_ramp(
    "vegetacion_agro_chaman",
    [
        (-0.5, "#6f4a2f"),
        (-0.2, "#7c5034"),
        (0.0, "#c68b5d"),
        (0.08, "#e0c486"),
        (0.15, "#eadf9a"),
        (0.22, "#d5e878"),
        (0.32, "#9edb5d"),
        (0.50, "#42aa49"),
        (0.72, "#157a33"),
        (1.0, "#00451f"),
    ],
    -0.5,
    1.0,
)

CANOPY_WATER_CMAP = LinearSegmentedColormap.from_list(
    "agua_canopia",
    [
        (0.0, "#7f4f24"),
        (0.22, "#bf7f3a"),
        (0.42, "#f0d59b"),
        (0.55, "#eef7f3"),
        (0.72, "#79d2ca"),
        (1.0, "#1267a7"),
    ],
)

SURFACE_WATER_CMAP = LinearSegmentedColormap.from_list(
    "agua_superficial",
    [
        (0.0, "#7c552f"),
        (0.32, "#d0a35f"),
        (0.5, "#f2e2ad"),
        (0.62, "#d8f2ef"),
        (0.82, "#49b7d5"),
        (1.0, "#0c5ca8"),
    ],
)

RED_EDGE_CMAP = LinearSegmentedColormap.from_list(
    "borde_rojo_clorofila",
    [
        (0.0, "#8c2f2a"),
        (0.2, "#d8703d"),
        (0.38, "#f0c95c"),
        (0.55, "#b5df73"),
        (0.75, "#38a852"),
        (1.0, "#0b6b2a"),
    ],
)

INDEX_RENDER_CONFIG = {
    # Rampas agronomicas por indice. En cultivos/lotes con suelo expuesto,
    # NDVI menor a 0.15 se mantiene como vigor bajo para no sobrerrepresentar verde.
    "ndvi": {"vmin": -0.5, "vmax": 1.0, "cmap": VEGETATION_CMAP},
    "savi": {"vmin": -0.5, "vmax": 1.0, "cmap": VEGETATION_CMAP},
    "evi": {"vmin": -0.5, "vmax": 1.0, "cmap": VEGETATION_CMAP},
    "ndmi": {"vmin": -0.45, "vmax": 0.5, "cmap": CANOPY_WATER_CMAP},
    "ndwi": {"vmin": -0.45, "vmax": 0.35, "cmap": SURFACE_WATER_CMAP},
    "ndre": {"vmin": -0.05, "vmax": 0.5, "cmap": RED_EDGE_CMAP},
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
    raw_values = values.astype("float32", copy=False)
    config = INDEX_RENDER_CONFIG.get(indice, INDEX_RENDER_CONFIG["ndvi"])
    vmin = float(config["vmin"])
    vmax = float(config["vmax"])
    valid = np.isfinite(raw_values) & (raw_values >= -1.0) & (raw_values <= 1.0)
    cmap = config["cmap"]

    rgba = np.zeros((raw_values.shape[0], raw_values.shape[1], 4), dtype=np.uint8)
    if np.any(valid):
        clipped = np.clip(raw_values[valid], -1.0, 1.0)
        # Escala fija por indice: no normalizar por escena ni por promedio del lote.
        normalized = np.clip((clipped - vmin) / (vmax - vmin), 0, 1)
        colors = (cmap(normalized) * 255).astype(np.uint8)
        rgba[valid, :3] = colors[:, :3]
        rgba[valid, 3] = 242

    img = Image.fromarray(rgba, mode="RGBA")
    img = _agregar_contorno_transparente(img)
    if NDVI_PNG_SCALE > 1:
        img = img.resize(
            (img.width * NDVI_PNG_SCALE, img.height * NDVI_PNG_SCALE),
            Image.Resampling.BILINEAR,
        )
    img.save(output_png_path, dpi=(dpi, dpi), optimize=True, compress_level=9)


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
