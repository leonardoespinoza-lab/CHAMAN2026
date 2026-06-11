import os

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject


def calcular_ndvi(b8_path, b4_path):
    """
    Calcula el NDVI a partir de las bandas NIR y Red, compatible con Landsat y Sentinel-2.
    Args:
        b8_path (str): Ruta a la banda NIR (B8 o nir08).
        b4_path (str): Ruta a la banda Red (B4 o red).
    Returns:
        tuple: NDVI como array numpy y perfil del raster.
    """
    if not os.path.exists(b8_path) or not os.path.exists(b4_path):
        raise FileNotFoundError("Las rutas de las bandas no existen")

    with rasterio.open(b8_path) as nir_src, rasterio.open(b4_path) as red_src:
        nir = nir_src.read(1)
        red = red_src.read(1)
        profile = nir_src.profile.copy()  # Esto incluye CRS y transform

        # Convertir a float32 y manejar valores nodata
        nir = nir.astype("float32")
        red = red.astype("float32")

        # Manejar nodata (0 para Landsat, NaN para Sentinel-2)
        if nir_src.nodata is not None:
            nir[nir == nir_src.nodata] = np.nan
        if red_src.nodata is not None:
            red[red == red_src.nodata] = np.nan

        # Calcular NDVI con manejo seguro de divisiones
        np.seterr(divide="ignore", invalid="ignore")
        ndvi = (nir - red) / (nir + red)
        ndvi = np.clip(ndvi, -1, 1)  # Asegurar rango válido

        # Actualizar perfil para el archivo de salida
        # Forzar CRS en el perfil de salida por seguridad
        profile.update(
            {
                "dtype": "float32",
                "nodata": np.nan,
                "crs": nir_src.crs,  # ← Asegurar que el CRS está incluido
            }
        )

        return ndvi, profile


def _read_band(path, reference=None):
    with rasterio.open(path) as src:
        data = src.read(1).astype("float32")
        if src.nodata is not None:
            data[data == src.nodata] = np.nan

        if reference is not None:
            _, ref_transform, ref_crs, ref_shape = reference
            needs_reproject = (
                data.shape != ref_shape
                or src.transform != ref_transform
                or src.crs != ref_crs
            )
            if needs_reproject:
                matched = np.full(ref_shape, np.nan, dtype="float32")
                reproject(
                    source=data,
                    destination=matched,
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=ref_transform,
                    dst_crs=ref_crs,
                    resampling=Resampling.bilinear,
                    src_nodata=np.nan,
                    dst_nodata=np.nan,
                )
                data = matched

        return data


def _safe_div(numerator, denominator):
    np.seterr(divide="ignore", invalid="ignore")
    return np.clip(numerator / denominator, -1, 1)


def _normalize_reflectance(data):
    finite = data[np.isfinite(data)]
    if finite.size and np.nanpercentile(finite, 95) > 2:
        return data / 10000.0
    return data


def _mean_index(data):
    valid = data[np.isfinite(data)]
    if valid.size == 0:
        return None
    return round(float(np.nanmean(valid)), 4)


def calcular_indices(band_paths):
    """
    Calcula indices satelitales promedio dentro del recorte del lote.
    Las bandas opcionales se reproyectan a la grilla NIR cuando tienen otra
    resolucion, como B05/B11 en Sentinel-2.
    """
    b8_path = band_paths.get("B08")
    b4_path = band_paths.get("B04")
    if not b8_path or not b4_path:
        raise FileNotFoundError("NDVI requiere bandas B08 y B04")

    with rasterio.open(b8_path) as nir_src:
        reference = (
            nir_src.profile.copy(),
            nir_src.transform,
            nir_src.crs,
            nir_src.read(1).shape,
        )
        nir = nir_src.read(1).astype("float32")
        if nir_src.nodata is not None:
            nir[nir == nir_src.nodata] = np.nan

    red = _read_band(b4_path, reference)
    blue = _read_band(band_paths["B02"], reference) if band_paths.get("B02") else None
    green = _read_band(band_paths["B03"], reference) if band_paths.get("B03") else None
    red_edge = _read_band(band_paths["B05"], reference) if band_paths.get("B05") else None
    swir1 = _read_band(band_paths["B11"], reference) if band_paths.get("B11") else None

    indices = {
        "ndvi": _mean_index(_safe_div(nir - red, nir + red)),
        "savi": _mean_index(((nir - red) * 1.5) / (nir + red + 0.5)),
    }

    if green is not None:
        indices["ndwi"] = _mean_index(_safe_div(green - nir, green + nir))

    if swir1 is not None:
        indices["ndmi"] = _mean_index(_safe_div(nir - swir1, nir + swir1))

    if red_edge is not None:
        indices["ndre"] = _mean_index(_safe_div(nir - red_edge, nir + red_edge))

    if blue is not None:
        nir_r = _normalize_reflectance(nir)
        red_r = _normalize_reflectance(red)
        blue_r = _normalize_reflectance(blue)
        indices["evi"] = _mean_index(
            2.5 * (nir_r - red_r) / (nir_r + 6 * red_r - 7.5 * blue_r + 1)
        )

    return {key: value for key, value in indices.items() if value is not None}


def exportar_geotiff(ndvi, profile, output_path):
    """Exporta el NDVI a GeoTIFF manteniendo la georreferenciación."""
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(ndvi.astype(rasterio.float32), 1)
