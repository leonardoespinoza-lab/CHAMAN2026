import logging
import os
import shutil
from typing import Optional

from config import LOCAL_NDVI_PATH

logger = logging.getLogger(__name__)


async def subir_a_storage(local_path: str, destino: str) -> Optional[str]:
    """
    Guarda el PNG NDVI en almacenamiento local compartido.
    Devuelve la URL relativa para servir desde nginx.
    """
    try:
        os.makedirs(LOCAL_NDVI_PATH, exist_ok=True)
        filename = os.path.basename(destino)
        dest_path = os.path.join(LOCAL_NDVI_PATH, filename)
        shutil.copy2(local_path, dest_path)
        logger.info(f"✅ PNG guardado en almacenamiento local: {dest_path}")
        return f"/ndvi/{filename}"
    except Exception as e:
        logger.error(f"❌ Error guardando archivo local: {e}")
        return None
