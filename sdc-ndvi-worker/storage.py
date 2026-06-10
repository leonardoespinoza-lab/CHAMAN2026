import base64
import logging
import os
import shutil
from typing import Optional

from config import LOCAL_NDVI_PATH

logger = logging.getLogger(__name__)

NDVI_STORAGE_MODE = os.getenv("NDVI_STORAGE_MODE", "local").lower()
NDVI_PUBLIC_BASE_URL = os.getenv("NDVI_PUBLIC_BASE_URL", "").rstrip("/")


async def subir_a_storage(local_path: str, destino: str) -> Optional[str]:
    """
    Guarda o embebe el PNG NDVI y devuelve una URL usable por el frontend.

    En Railway los servicios no comparten filesystem por defecto, por eso el
    modo inline evita depender de un volumen compartido para la primera version.
    """
    try:
        if NDVI_STORAGE_MODE == "inline":
            with open(local_path, "rb") as file:
                encoded = base64.b64encode(file.read()).decode("ascii")
            logger.info("PNG NDVI embebido como data URL para entorno sin volumen compartido")
            return f"data:image/png;base64,{encoded}"

        os.makedirs(LOCAL_NDVI_PATH, exist_ok=True)
        filename = os.path.basename(destino)
        dest_path = os.path.join(LOCAL_NDVI_PATH, filename)
        shutil.copy2(local_path, dest_path)
        logger.info(f"PNG guardado en almacenamiento local: {dest_path}")
        relative_url = f"/ndvi/{filename}"
        return f"{NDVI_PUBLIC_BASE_URL}{relative_url}" if NDVI_PUBLIC_BASE_URL else relative_url
    except Exception as e:
        logger.error(f"Error guardando archivo NDVI: {e}")
        return None
