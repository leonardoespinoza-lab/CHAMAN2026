import shutil
import time
from datetime import timedelta
from pathlib import Path


def limpiar_descargas_antiguas(directorio_base: str, tiempo_limite: timedelta):
    base = Path(directorio_base)
    if not base.exists():
        return  # Silencioso en producción

    now = time.time()
    for folder in base.iterdir():
        try:
            if not folder.is_dir():
                continue

            # Verificar archivos clave
            required_files = ["B04.tif", "B08.tif", "metadata.json"]
            if not all((folder / f).exists() for f in required_files):
                continue

            # Obtener tiempo de modificación del metadato
            mod_time = (folder / "metadata.json").stat().st_mtime
            if (now - mod_time) > tiempo_limite.total_seconds():
                print(f"Eliminando escena antigua: {folder.name}")
                shutil.rmtree(folder, ignore_errors=True)
        except Exception as e:
            print(f"Error limpiando {folder.name}: {str(e)}")
            continue
