import os

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

LANDSAT_C2_L2_SCALE = 0.0000275
LANDSAT_C2_L2_OFFSET = -0.2


def calcular_ndvi(b8_path, b4_path, collection=None):
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

        nir = _to_reflectance(nir_src, nir, collection)
        red = _to_reflectance(red_src, red, collection)

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


def _scale_offset(src, collection=None):
    scale = src.scales[0] if src.scales else 1
    offset = src.offsets[0] if src.offsets else 0
    if collection == "landsat-c2-l2" and scale == 1 and offset == 0:
        return LANDSAT_C2_L2_SCALE, LANDSAT_C2_L2_OFFSET
    return scale, offset


def _apply_scale_offset(src, data, collection=None):
    scale, offset = _scale_offset(src, collection)
    if scale != 1 or offset != 0:
        return data * scale + offset
    return data


def _read_band(
    path,
    reference=None,
    reflectance=True,
    collection=None,
    resampling=Resampling.bilinear,
):
    with rasterio.open(path) as src:
        data = src.read(1).astype("float32")
        if src.nodata is not None:
            data[data == src.nodata] = np.nan
        if reflectance:
            data = _to_reflectance(src, data, collection)

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
                    resampling=resampling,
                    src_nodata=np.nan,
                    dst_nodata=np.nan,
                )
                data = matched

        return data


def _safe_div(numerator, denominator):
    np.seterr(divide="ignore", invalid="ignore")
    return np.clip(numerator / denominator, -1, 1)


def _to_reflectance(src, data, collection=None):
    return _normalize_reflectance(_apply_scale_offset(src, data, collection))


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


def _apply_quality_mask(arrays, mask):
    if mask is None:
        return arrays
    masked = []
    for data in arrays:
        if data is None:
            masked.append(None)
            continue
        copy = data.astype("float32", copy=True)
        copy[~mask] = np.nan
        masked.append(copy)
    return masked


def _build_quality_mask(band_paths, reference):
    _, _, _, ref_shape = reference
    base_mask = np.ones(ref_shape, dtype=bool)
    source = "none"

    scl_path = band_paths.get("SCL")
    if scl_path:
        scl = _read_band(
            scl_path,
            reference,
            reflectance=False,
            resampling=Resampling.nearest,
        )
        # Sentinel-2 L2A Scene Classification:
        # 4 vegetation, 5 bare soil, 6 water. Exclude no-data, saturated,
        # shadows, clouds, cirrus, snow and unclassified pixels.
        scl_int = np.nan_to_num(np.rint(scl), nan=-1).astype("int16")
        base_mask &= np.isin(scl_int, [4, 5, 6])
        source = "sentinel-2-scl"

    qa_path = band_paths.get("QA_PIXEL")
    if qa_path:
        qa = _read_band(
            qa_path,
            reference,
            reflectance=False,
            resampling=Resampling.nearest,
        )
        qa_int = np.nan_to_num(qa, nan=0).astype("uint16")
        fill = (qa_int & (1 << 0)) != 0
        dilated_cloud = (qa_int & (1 << 1)) != 0
        cirrus = (qa_int & (1 << 2)) != 0
        cloud = (qa_int & (1 << 3)) != 0
        cloud_shadow = (qa_int & (1 << 4)) != 0
        snow = (qa_int & (1 << 5)) != 0
        clear = (qa_int & (1 << 6)) != 0
        base_mask &= clear & ~(fill | dilated_cloud | cirrus | cloud | cloud_shadow | snow)
        source = "landsat-c2-qa-pixel" if source == "none" else f"{source}+landsat-c2-qa-pixel"

    valid_pixels = int(np.count_nonzero(base_mask))
    total_pixels = int(base_mask.size)
    return {
        "mask": base_mask,
        "metadata": {
            "source": source,
            "validPixels": valid_pixels,
            "totalPixels": total_pixels,
            "validCoveragePct": round((valid_pixels / total_pixels) * 100, 2) if total_pixels else 0,
        },
    }


def calcular_indices_y_rasters(band_paths, collection=None):
    """
    Calcula indices satelitales promedio y sus rasters dentro del recorte del lote.
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
        nir = _to_reflectance(nir_src, nir, collection)
        profile = nir_src.profile.copy()

    red = _read_band(b4_path, reference, collection=collection)
    blue = (
        _read_band(band_paths["B02"], reference, collection=collection)
        if band_paths.get("B02")
        else None
    )
    green = (
        _read_band(band_paths["B03"], reference, collection=collection)
        if band_paths.get("B03")
        else None
    )
    red_edge = (
        _read_band(band_paths["B05"], reference, collection=collection)
        if band_paths.get("B05")
        else None
    )
    swir1 = (
        _read_band(band_paths["B11"], reference, collection=collection)
        if band_paths.get("B11")
        else None
    )

    quality = _build_quality_mask(band_paths, reference)
    quality_mask = quality["mask"]
    finite_base = np.isfinite(nir) & np.isfinite(red)
    quality_mask &= finite_base
    nir, red, blue, green, red_edge, swir1 = _apply_quality_mask(
        [nir, red, blue, green, red_edge, swir1],
        quality_mask,
    )

    rasters = {
        "ndvi": _safe_div(nir - red, nir + red),
        "savi": np.clip(((nir - red) * 1.5) / (nir + red + 0.5), -1, 1),
    }

    if green is not None:
        rasters["ndwi"] = _safe_div(green - nir, green + nir)

    if swir1 is not None:
        rasters["ndmi"] = _safe_div(nir - swir1, nir + swir1)

    if red_edge is not None:
        rasters["ndre"] = _safe_div(nir - red_edge, nir + red_edge)

    if blue is not None:
        rasters["evi"] = np.clip(
            2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1),
            -1,
            1,
        )

    indices = {}
    for key, value in rasters.items():
        mean = _mean_index(value)
        if mean is not None:
            indices[key] = mean

    profile.update({"dtype": "float32", "nodata": np.nan, "crs": reference[2]})
    quality["metadata"]["validPixels"] = int(np.count_nonzero(quality_mask))
    quality["metadata"]["validCoveragePct"] = (
        round((quality["metadata"]["validPixels"] / quality["metadata"]["totalPixels"]) * 100, 2)
        if quality["metadata"]["totalPixels"]
        else 0
    )
    return {
        "indices": indices,
        "rasters": rasters,
        "profile": profile,
        "qualityMask": quality["metadata"],
    }


def calcular_indices(band_paths):
    return calcular_indices_y_rasters(band_paths)["indices"]


def exportar_geotiff(ndvi, profile, output_path):
    """Exporta el NDVI a GeoTIFF manteniendo la georreferenciación."""
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(ndvi.astype(rasterio.float32), 1)
