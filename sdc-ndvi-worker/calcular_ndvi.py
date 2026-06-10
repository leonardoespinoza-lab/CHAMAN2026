import os

import numpy as np
import rasterio


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


def exportar_geotiff(ndvi, profile, output_path):
    """Exporta el NDVI a GeoTIFF manteniendo la georreferenciación."""
    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(ndvi.astype(rasterio.float32), 1)
