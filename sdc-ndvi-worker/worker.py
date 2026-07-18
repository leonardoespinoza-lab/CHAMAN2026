import asyncio
import json
import logging
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import rasterio
import redis.asyncio as redis
from planetary_computer import sign
from pystac_client import Client
from shapely.geometry import Polygon, mapping

from calcular_ndvi import calcular_indices_y_rasters, calcular_ndvi, exportar_geotiff
from cleaner import limpiar_descargas_antiguas
from config import (
    API_EXTERNA_URL,
    CLEAN_UP,
    DOWNLOAD_FOLDER,
    ENVIAR_BACKEND,
    LOCAL_NDVI_PATH,
    NDVI_WORKER_TOKEN,
    NDVI_QUEUE_COMPLETED_TTL_SECONDS,
    NDVI_QUEUE_MAX_ATTEMPTS,
    NDVI_QUEUE_POLL_SECONDS,
    NDVI_QUEUE_RETRY_BASE_SECONDS,
    NDVI_QUEUE_RETRY_MAX_SECONDS,
    NDVI_QUEUE_VISIBILITY_TIMEOUT_SECONDS,
    PORT,
    REDIS_DB,
    REDIS_HOST,
    REDIS_PASSWORD,
    REDIS_PORT,
    REDIS_QUEUE,
    SAT_COLLECTIONS,
    SAT_CLOUD_COVER_THRESHOLDS,
    SAT_DELTA_VENCIMIENTO,
    SAT_SENTINEL_PREFERENCE_DAYS,
)
from geo import obtener_metadata_png_con_polygon, scene_cubre_poligono
from health import start_health_server
from reliable_queue import (
    PermanentTaskError,
    ReliableRedisQueue,
    TaskProcessingError,
    TransientTaskError,
)
from recorte import (
    exportar_png_desde_array_validado,
    exportar_png_desde_tif_con_polygon,
    recortar_ndvi,
)
from storage import subir_a_storage

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(name)s] [%(levelname)s] - %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("worker.log")],
)
logger = logging.getLogger(__name__)

EARTH_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
SATELLITE_RENDER_VERSION = "fixed-index-v3"
MIN_SATELLITE_VALID_COVERAGE_PCT = 3.0


def validated_satellite_index_mean(
    indices: dict,
    quality_mask: dict,
    key: str = "ndvi",
    min_coverage_pct: float = MIN_SATELLITE_VALID_COVERAGE_PCT,
) -> Optional[float]:
    """Devuelve un promedio solo cuando proviene de pixeles con QA suficiente."""
    try:
        value = float(indices.get(key))
        coverage = float(quality_mask.get("validCoveragePct"))
    except (AttributeError, TypeError, ValueError):
        return None

    if not np.isfinite(value) or not -1.0 <= value <= 1.0:
        return None
    if not np.isfinite(coverage) or coverage < min_coverage_pct:
        return None
    return value

BAND_MAPPING = {
    "sentinel-2-l2a": {
        "red": "B04",
        "nir": "B08",
        "assets": ["B02", "B03", "B04", "B05", "B08", "B11", "SCL"],
        "output_names": {
            "B02": "B02",
            "B03": "B03",
            "B04": "B04",
            "B05": "B05",
            "B08": "B08",
            "B11": "B11",
            "SCL": "SCL",
        },
    },
    "landsat-c2-l2": {
        "red": "red",
        "nir": "nir08",
        "assets": ["blue", "green", "red", "nir08", "swir16", "qa_pixel"],
        "output_names": {
            "blue": "B02",
            "green": "B03",
            "red": "B04",
            "nir08": "B08",
            "swir16": "B11",
            "qa_pixel": "QA_PIXEL",
        },
    },
}

COLLECTION_PRIORITY = {
    "sentinel-2-l2a": 0,
    "landsat-c2-l2": 1,
}


class NDVIWorker:
    def __init__(self):
        self.redis = None
        self.http_client = httpx.AsyncClient(timeout=30.0)
        self.task_queue = None

    async def initialize(self):
        """Inicializa conexiones y servicios"""
        # Mostrar configuraciones al iniciar
        self._log_configuration()

        self.redis = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD or None,
            db=REDIS_DB,
            socket_connect_timeout=5,
        )
        await self._check_redis_connection()
        self.task_queue = ReliableRedisQueue(
            self.redis,
            REDIS_QUEUE,
            max_attempts=NDVI_QUEUE_MAX_ATTEMPTS,
            retry_base_seconds=NDVI_QUEUE_RETRY_BASE_SECONDS,
            retry_max_seconds=NDVI_QUEUE_RETRY_MAX_SECONDS,
            visibility_timeout_seconds=NDVI_QUEUE_VISIBILITY_TIMEOUT_SECONDS,
            poll_seconds=NDVI_QUEUE_POLL_SECONDS,
            completed_ttl_seconds=NDVI_QUEUE_COMPLETED_TTL_SECONDS,
        )
        await self.task_queue.initialize()
        asyncio.create_task(self._periodic_cleanup())

    def _log_configuration(self):
        """Log de configuraciones importantes al iniciar"""
        logger.info("Configuracion del Worker:")
        logger.info(
            f"  • Redis: {REDIS_HOST}:{REDIS_PORT} (DB: {REDIS_DB}, Cola: {REDIS_QUEUE})"
        )
        logger.info(f"  • Directorio descargas: {DOWNLOAD_FOLDER}")
        logger.info(f"  • Almacenamiento local NDVI: {LOCAL_NDVI_PATH}")
        logger.info(f"  • API Externa: {API_EXTERNA_URL}")
        logger.info(f"  • Puerto salud: {PORT}")
        logger.info(f"  • STAC Endpoint: {EARTH_SEARCH_URL}")
        logger.info(f"  • Colecciones SAT: {SAT_COLLECTIONS}")
        logger.info(f"  • SAT Delta Vencimiento: {SAT_DELTA_VENCIMIENTO} días")

    async def _check_redis_connection(self):
        """Verifica la conexión a Redis"""
        try:
            if await self.redis.ping():
                logger.info("Conexion a Redis establecida")
        except Exception as e:
            logger.error(f"Error conectando a Redis: {e}")
            raise

    async def _periodic_cleanup(self):
        """Limpieza periódica de archivos temporales"""
        while True:
            hours = 12 * 3600  # Cada 12 horas
            try:
                logger.info(
                    f"Iniciando limpieza periodica cada {hours / 3600} horas"
                )
                limpiar_descargas_antiguas(
                    directorio_base=f"{DOWNLOAD_FOLDER}/scenes",
                    tiempo_limite=timedelta(days=SAT_DELTA_VENCIMIENTO),
                )
            except Exception as e:
                logger.error(f"Error en limpieza periódica: {e}")
            await asyncio.sleep(hours)

    @staticmethod
    def _safe_filename(value: str) -> str:
        """Normaliza identificadores para nombres de archivo remotos."""
        safe = "".join(
            ch if ch.isalnum() or ch in "-_" else "-" for ch in str(value or "")
        )
        return safe.strip("-") or "lote"

    @staticmethod
    def _scene_key(ndvi_data: dict) -> str:
        """Clave estable de escena para no reutilizar rasters de otra fecha."""
        scene_datetime = ndvi_data.get("scene_datetime")
        if hasattr(scene_datetime, "strftime"):
            return scene_datetime.strftime("%Y%m%dT%H%M%S")
        if scene_datetime:
            return (
                str(scene_datetime)
                .replace(":", "")
                .replace("-", "")
                .replace(".", "")
                .replace("+", "")
                .replace(" ", "T")
            )
        return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")

    async def download_image(self, url: str, save_path: str) -> bool:
        """Versión mejorada con más logging y reintentos"""
        filename = Path(save_path).name
        parent_dir = Path(save_path).parent
        parent_dir.mkdir(parents=True, exist_ok=True)

        for attempt in range(3):
            try:
                logger.info(f"Intento {attempt + 1} para {filename}...")

                # Verificar espacio en disco
                free_space = shutil.disk_usage(parent_dir).free
                if free_space < 100 * 1024 * 1024:  # 100MB mínimo
                    logger.error("Espacio en disco insuficiente")
                    return False

                async with self.http_client.stream(
                    "GET", url, follow_redirects=True
                ) as response:
                    response.raise_for_status()

                    total_size = int(response.headers.get("content-length", 0))
                    if total_size > free_space:
                        logger.error("No hay suficiente espacio para el archivo")
                        return False

                    with open(save_path, "wb") as f:
                        downloaded = 0
                        async for chunk in response.aiter_bytes(chunk_size=1024 * 64):
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                percent = (downloaded / total_size) * 100
                                if (
                                    attempt == 0
                                ):  # Solo loggear progreso en primer intento
                                    logger.debug(f"{filename} - {percent:.1f}%")

                    # Verificar que el archivo se descargó completamente
                    if total_size > 0 and Path(save_path).stat().st_size != total_size:
                        raise IOError("Tamaño del archivo no coincide con el esperado")

                    logger.info(f"Descarga completada: {filename}")
                    return True

            except Exception as e:
                logger.warning(
                    f"Intento {attempt + 1} fallido para {filename}: {str(e)}"
                )
                if attempt < 2:  # No esperar después del último intento
                    await asyncio.sleep(2**attempt)  # Backoff exponencial
                try:
                    Path(save_path).unlink(missing_ok=True)  # Eliminar archivo parcial
                except:
                    pass

        logger.error(f"Fallo al descargar {filename} después de 3 intentos")
        return False

    async def find_latest_sentinel_scene(
        self,
        polygon: Polygon,
        start_date: Optional[datetime] = None,
        last_collection: Optional[str] = None,
        allow_same_date: bool = False,
        exact_scene_date: bool = False,
    ) -> Optional[dict]:
        """Busca una escena que cubra el polígono, desde una fecha o en el día exacto solicitado."""
        timer_start = time.time()
        try:
            logger.info("Buscando escena mas reciente...")

            # --- LÓGICA DE FECHA ---
            if exact_scene_date:
                if not start_date:
                    logger.error(
                        "Una tarea de backfill exacto requiere scene_datetime."
                    )
                    return None
                search_start_date = start_date.replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                search_end_date = search_start_date + timedelta(days=1) - timedelta(
                    microseconds=1
                )
                datetime_filter = (
                    f"{search_start_date.isoformat()}/{search_end_date.isoformat()}"
                )
                logger.info(
                    "   -> Backfill exacto: buscando exclusivamente escenas del "
                    f"{search_start_date.date()}."
                )
            elif start_date:
                if allow_same_date:
                    search_start_date = start_date.replace(
                        hour=0, minute=0, second=0, microsecond=0
                    )
                elif last_collection and self._collection_priority(
                    last_collection
                ) > self._collection_priority("sentinel-2-l2a"):
                    search_start_date = start_date - timedelta(
                        days=SAT_SENTINEL_PREFERENCE_DAYS
                    )
                    logger.info(
                        "   -> Ultima escena fue Landsat; se abre ventana de calidad "
                        f"desde {search_start_date.date()} para permitir Sentinel-2 cercano."
                    )
                else:
                    search_start_date = start_date + timedelta(days=1)
                logger.info(
                    f"   -> Filtro de fecha optimizado: buscando a partir de {search_start_date.date()}"
                )
            else:
                search_start_date = datetime.now(timezone.utc) - timedelta(days=60)
                logger.info(
                    f"   -> Sin fecha de job previo. Buscando en los últimos 60 días (desde {search_start_date.date()})."
                )

            if not exact_scene_date:
                datetime_filter = f"{search_start_date.isoformat()}/.."

            client = Client.open(EARTH_SEARCH_URL, timeout=300)

            thresholds = SAT_CLOUD_COVER_THRESHOLDS or [30]
            for cloud_threshold in thresholds:
                logger.info(
                    f"   -> Buscando escena con nubosidad menor a {cloud_threshold}%"
                )
                search = client.search(
                    collections=SAT_COLLECTIONS,
                    intersects=mapping(polygon),
                    datetime=datetime_filter,
                    query={
                        "eo:cloud_cover": {"lt": cloud_threshold},
                    },
                    sortby=[{"field": "datetime", "direction": "desc"}],
                    limit=20,
                )
                items = list(search.items())
                if items:
                    selected = self._select_best_scene(items)
                    logger.info(
                        f"   -> Escena candidata {selected.id} ({selected.collection_id}) con nubosidad {selected.properties.get('eo:cloud_cover', 's/d')}%"
                    )
                    return sign(selected)

            logger.info("   -> No se encontraron escenas con los umbrales configurados.")
            return None
        except Exception as e:
            logger.error(f"Error buscando escena Sentinel: {e}")
            return None
        finally:
            timer_end = time.time()
            logger.info(
                f"Busqueda de escena completada en {timer_end - timer_start:.2f}s"
            )

    def _select_best_scene(self, items: list):
        dated_items = [item for item in items if self._scene_datetime(item)]
        if not dated_items:
            return items[0]

        newest_datetime = max(self._scene_datetime(item) for item in dated_items)
        window_start = newest_datetime - timedelta(days=SAT_SENTINEL_PREFERENCE_DAYS)
        candidates = [
            item
            for item in dated_items
            if self._scene_datetime(item) >= window_start
        ] or dated_items

        return sorted(
            candidates,
            key=lambda item: (
                self._collection_priority(item.collection_id),
                -self._scene_datetime(item).timestamp(),
                self._scene_cloud_cover(item),
            ),
        )[0]

    @staticmethod
    def _scene_datetime(scene) -> Optional[datetime]:
        if getattr(scene, "datetime", None):
            return scene.datetime
        value = getattr(scene, "properties", {}).get("datetime")
        if value:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return None

    @staticmethod
    def _scene_cloud_cover(scene) -> float:
        value = getattr(scene, "properties", {}).get("eo:cloud_cover", 100)
        try:
            return float(value)
        except (TypeError, ValueError):
            return 100.0

    @staticmethod
    def _collection_priority(collection: Optional[str]) -> int:
        return COLLECTION_PRIORITY.get(collection or "", 99)

    async def process_task(self, task_data: dict):
        """Procesa una tarea NDVI; solo retorna cuando el resultado es durable."""
        task_start = time.time()
        lote_id = str(task_data.get("lote_id") or "").strip()
        if not lote_id:
            raise PermanentTaskError(
                "La tarea NDVI no contiene lote_id", code="missing_lote_id"
            )
        if "polygon" not in task_data:
            raise PermanentTaskError(
                "La tarea NDVI no contiene polygon", code="missing_polygon"
            )

        try:
            try:
                polygon = self._validate_polygon(task_data["polygon"])
                job_datetime = self._parse_job_datetime(
                    task_data.get("scene_datetime")
                )
            except (TypeError, ValueError, KeyError) as error:
                raise PermanentTaskError(
                    "Geometria o fecha invalida en la tarea NDVI",
                    code="invalid_task_data",
                ) from error

            job_collection = task_data.get("scene_collection")
            force_render = bool(
                task_data.get("force_render") or task_data.get("forceRender")
            )
            exact_scene_date = bool(
                task_data.get("exact_scene_date")
                or task_data.get("exactSceneDate")
            )
            known_scenes = self._parse_known_scenes(task_data.get("known_scenes"))

            # Paso 1: Obtener o descargar escena
            scene_data = await self._get_scene_data(
                polygon,
                job_datetime,
                job_collection,
                force_render,
                exact_scene_date,
            )
            if not scene_data:
                raise TransientTaskError(
                    "No se encontro una escena satelital util para el lote",
                    code="scene_unavailable",
                )

            if not force_render and self._is_known_scene(
                scene_data["datetime"],
                scene_data.get("collection"),
                known_scenes,
            ):
                logger.info(
                    "Escena ya persistida para el lote "
                    f"({scene_data['datetime'].date()}, {scene_data.get('collection')}); "
                    "se evita recalcular un reemplazo de calidad existente."
                )
                return {"status": "known_scene"}

            # Verificar si la escena ya fue procesada para este job
            if self._is_scene_processed(
                scene_data["datetime"],
                job_datetime,
                scene_data.get("collection"),
                job_collection,
                force_render,
                exact_scene_date,
            ):
                logger.info(
                    f"Escena {scene_data['id']} ya procesada para este job. Saltando..."
                )
                return {"status": "already_processed"}

            # Paso 2: Procesar NDVI
            ndvi_results = await self._process_ndvi(lote_id, polygon, scene_data)
            if not ndvi_results:
                raise TransientTaskError(
                    "El calculo de indices no produjo resultados validos",
                    code="empty_ndvi_result",
                )

            # Paso 3: Generar salidas y subir a storage
            output_data = await self._generate_outputs(lote_id, polygon, ndvi_results)

            logger.info(
                f"Lote {lote_id} procesado exitosamente: {output_data['ndvi_promedio']:.4f}"
            )

            if ENVIAR_BACKEND == "true":
                logger.info("Enviando resultados al backend...")
                # Paso 4: Notificar al backend
                await self._notify_backend(lote_id, output_data)

            return {"status": "processed", "output": output_data}
        except TaskProcessingError:
            raise
        finally:
            try:
                if CLEAN_UP == "true":
                    logger.info(f"Limpiando archivos temporales de {lote_id}...")
                    # Paso 5: Limpieza de archivos temporales
                    await self._cleanup(lote_id)
            except Exception as cleanup_error:
                logger.warning(
                    f"No se pudo limpiar el temporal de {lote_id}: {cleanup_error}"
                )
            logger.info(
                f"Tiempo total lote {lote_id}: {time.time() - task_start:.2f}s"
            )

    def _check_existing_results(self, lote_id: str, polygon: Polygon) -> Optional[dict]:
        """Verifica si ya tenemos resultados procesados para este lote"""
        lote_dir = Path(DOWNLOAD_FOLDER) / lote_id
        if not lote_dir.exists():
            return None

        try:
            png_path = lote_dir / "ndvi_recorte.png"
            tif_path = lote_dir / "ndvi_recorte.tif"

            if png_path.exists() and tif_path.exists():
                # Verificar que el polígono coincida
                with rasterio.open(str(tif_path)) as src:
                    if scene_cubre_poligono(str(tif_path), polygon):
                        metadata = obtener_metadata_png_con_polygon(
                            str(tif_path), polygon
                        )
                        return {
                            "url_png": None,  # Se generará local
                            # Un TIFF legado no contiene SCL/QA suficiente para
                            # recuperar una lectura agronómica confiable.
                            "ndvi_promedio": None,
                            "metadata": metadata,
                            "local_path": str(png_path),
                        }
        except Exception as e:
            logger.warning(f"Error verificando resultados existentes: {e}")
        return None

    def calcular_promedio_ndvi(self, tif_path: str) -> float:
        """
        Calcula el promedio de valores NDVI válidos (rango [-1, 1]) en un GeoTIFF.
        Excluye píxeles con valores NaN o fuera de rango.

        Args:
            tif_path: Ruta al archivo TIFF con los valores NDVI

        Returns:
            float: Valor promedio del NDVI en el área recortada (0.0 si no hay valores válidos)
        """
        try:
            with rasterio.open(tif_path) as src:
                ndvi_data = src.read(1)  # Lee la banda 1 (NDVI)

                # Máscara para valores válidos (entre -1 y 1, excluyendo NaN)
                valid_mask = (
                    (~np.isnan(ndvi_data)) & (ndvi_data >= -1.0) & (ndvi_data <= 1.0)
                )
                valid_values = ndvi_data[valid_mask]

                if valid_values.size == 0:
                    logger.warning("No hay valores NDVI válidos en el archivo")
                    return 0.0

                # Calcular promedio y asegurarse que es un float válido
                promedio = float(np.mean(valid_values))
                if np.isnan(promedio):
                    return 0.0
                return promedio

        except Exception as e:
            logger.error(f"Error calculando promedio NDVI: {e}")
            return 0.0

    async def _get_cached_scene(
        self,
        polygon: Polygon,
        job_datetime: Optional[datetime],
        job_collection: Optional[str] = None,
        force_render: bool = False,
        exact_scene_date: bool = False,
    ) -> Optional[dict]:
        """Busca escenas válidas en caché local"""
        scenes_dir = Path(DOWNLOAD_FOLDER) / "scenes"
        if not scenes_dir.exists():
            return None

        for scene_dir in sorted(
            scenes_dir.iterdir(), key=lambda x: x.name, reverse=True
        ):
            if not scene_dir.is_dir():
                continue

            b4_path = scene_dir / "B04.tif"
            b8_path = scene_dir / "B08.tif"
            metadata_path = scene_dir / "metadata.json"

            if b4_path.exists() and b8_path.exists() and metadata_path.exists():
                try:
                    if not scene_cubre_poligono(str(b4_path), polygon):
                        continue

                    scene_date = self._get_scene_date(str(b4_path))
                    if not scene_date:
                        logger.warning(
                            f"No se pudo obtener la fecha de la escena en caché {scene_dir.name}. Saltando."
                        )
                        continue

                    if exact_scene_date and (
                        not job_datetime
                        or scene_date.date() != job_datetime.date()
                    ):
                        continue

                    # LÓGICA CONSISTENTE: Si hay un job_datetime y la escena en caché es igual o anterior, no es candidata.
                    if (
                        not exact_scene_date
                        and job_datetime
                        and force_render
                        and scene_date.date() < job_datetime.date()
                    ):
                        continue

                    if (
                        not exact_scene_date
                        and job_datetime
                        and not force_render
                        and scene_date.date() <= job_datetime.date()
                    ):
                        with open(metadata_path) as f:
                            metadata_precheck = json.load(f)
                        collection_precheck = metadata_precheck.get(
                            "collection", "desconocida"
                        )
                        if not self._is_quality_replacement(
                            scene_date,
                            job_datetime,
                            collection_precheck,
                            job_collection,
                        ):
                            continue

                    # LÓGICA DE EXPIRACIÓN: Si la escena es muy vieja respecto al día de hoy.
                    if datetime.now(timezone.utc) - scene_date > timedelta(
                        days=SAT_DELTA_VENCIMIENTO
                    ):
                        continue

                    # Si pasa los filtros, es una candidata válida desde la caché.
                    with open(metadata_path) as f:
                        metadata = json.load(f)

                    collection = metadata.get(
                        "collection", "desconocida"
                    )  # Obtener colección, con fallback

                    quality_band = {
                        "sentinel-2-l2a": "SCL",
                        "landsat-c2-l2": "QA_PIXEL",
                    }.get(collection)
                    if quality_band and not (scene_dir / f"{quality_band}.tif").exists():
                        logger.info(
                            f"Escena en cache {scene_dir.name} sin banda de calidad {quality_band}; se descarta para render v3."
                        )
                        continue

                    logger.info(f"Usando escena en cache: {scene_dir.name}")
                    band_paths = {
                        band: str(scene_dir / f"{band}.tif")
                        for band in ["B02", "B03", "B04", "B05", "B08", "B11", "SCL", "QA_PIXEL"]
                        if (scene_dir / f"{band}.tif").exists()
                    }

                    return {
                        "id": scene_dir.name,
                        "b4_path": str(b4_path),
                        "b8_path": str(b8_path),
                        "datetime": scene_date or datetime.now(timezone.utc),
                        "collection": collection,
                        "band_paths": band_paths,
                    }
                except Exception as e:
                    logger.warning(f"Error verificando escena {scene_dir.name}: {e}")
        return None

    def _validate_polygon(self, polygon_data: list) -> Polygon:
        """Valida y convierte el polígono de entrada"""
        polygon = Polygon(polygon_data[0])  # Usar anillo exterior
        if not polygon.is_valid:
            raise ValueError("Polígono no válido")
        return polygon

    def _parse_job_datetime(self, datetime_str: Optional[str]) -> Optional[datetime]:
        if datetime_str:
            return datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        return None

    @staticmethod
    def _parse_known_scenes(raw_scenes) -> set:
        known_scenes = set()
        for scene in raw_scenes or []:
            if not isinstance(scene, dict):
                continue
            raw_date = scene.get("date") or scene.get("fecha")
            collection = str(scene.get("collection") or "").strip().lower()
            if not raw_date or not collection:
                continue
            try:
                scene_date = datetime.fromisoformat(
                    str(raw_date).replace("Z", "+00:00")
                ).date()
            except (TypeError, ValueError):
                continue
            known_scenes.add((scene_date, collection))
        return known_scenes

    @staticmethod
    def _is_known_scene(
        scene_datetime: Optional[datetime],
        scene_collection: Optional[str],
        known_scenes: set,
    ) -> bool:
        if not scene_datetime or not scene_collection:
            return False
        return (
            scene_datetime.date(),
            str(scene_collection).strip().lower(),
        ) in known_scenes

    async def _release_dedupe_reservation(
        self,
        dedupe_key: Optional[str],
        dedupe_token: Optional[str],
    ):
        if (
            not self.redis
            or not isinstance(dedupe_key, str)
            or not dedupe_key.startswith("ndvi-task:")
            or not dedupe_token
        ):
            return
        try:
            await self.redis.eval(
                "\n".join(
                    [
                        "if redis.call('get', KEYS[1]) == ARGV[1] then",
                        "  return redis.call('del', KEYS[1])",
                        "end",
                        "return 0",
                    ]
                ),
                1,
                dedupe_key,
                str(dedupe_token),
            )
        except Exception as error:
            logger.warning(
                f"No se pudo liberar la reserva NDVI {dedupe_key}: {error}"
            )

    async def _get_scene_data(
        self,
        polygon: Polygon,
        job_datetime: Optional[datetime],
        job_collection: Optional[str] = None,
        force_render: bool = False,
        exact_scene_date: bool = False,
    ) -> Optional[dict]:
        """Obtiene datos de escena (de caché o nueva descarga)"""
        try:
            # 1. Buscar en caché primero (ya con la lógica corregida)
            cached_scene = await self._get_cached_scene(
                polygon,
                job_datetime,
                job_collection,
                force_render,
                exact_scene_date,
            )
            if cached_scene:
                logger.info(f"Usando escena en cache: {cached_scene['id']}")
                return cached_scene

            # 2. Si no hay en caché, buscar nueva escena pasando el job_datetime como start_date
            scene = await self.find_latest_sentinel_scene(
                polygon,
                start_date=job_datetime,
                last_collection=job_collection,
                allow_same_date=force_render,
                exact_scene_date=exact_scene_date,
            )
            if not scene:
                logger.error(
                    "No se encontraron escenas nuevas disponibles que cumplan los criterios."
                )
                return None

            # 3. Procesar nueva escena
            scene_data = await self._process_new_scene(scene)
            if scene_data:
                # Asegurar que tenemos datetime (usar fecha actual si no hay)
                if "datetime" not in scene_data or scene_data["datetime"] is None:
                    scene_data["datetime"] = datetime.now(timezone.utc)
                return scene_data

            return None

        except Exception as e:
            logger.error(f"Error en _get_scene_data: {str(e)}", exc_info=True)
            return None

    async def _process_new_scene(self, scene) -> Optional[dict]:
        """Procesa y guarda una nueva escena descargada, adaptándose a su colección."""
        try:
            collection_id = scene.collection_id
            logger.info(
                f"Procesando escena {scene.id} de la colección: {collection_id}"
            )

            # Verificar que la colección de la escena esté soportada en nuestro mapping
            if collection_id not in BAND_MAPPING:
                logger.error(
                    f"Colección no soportada encontrada en la escena: {collection_id}"
                )
                return None

            # Obtener el mapeo específico para esta colección
            collection_map = BAND_MAPPING[collection_id]

            # Crear directorio para la escena
            scene_folder = Path(DOWNLOAD_FOLDER) / "scenes" / scene.id
            scene_folder.mkdir(parents=True, exist_ok=True)

            # Guardar metadata
            metadata = {
                "id": scene.id,
                "date": scene.datetime.isoformat(),
                "collection": collection_id,  # Usar el collection_id dinámico
                "cloud_cover": scene.properties.get("eo:cloud_cover", 0),
                "geometry": scene.geometry,
                "properties": scene.properties,
            }
            metadata_path = scene_folder / "metadata.json"
            metadata_path.write_text(
                json.dumps(metadata, indent=2, default=str)
            )  # default=str por si hay objetos no serializables

            required_assets = collection_map["assets"]

            logger.info(f"Descargando assets requeridos: {required_assets}")

            download_tasks = []
            for asset_name in required_assets:
                # Obtener el nombre de salida uniforme (ej: 'B04' o 'B08')
                output_name = collection_map["output_names"][asset_name]

                task = self.download_image(
                    scene.assets[asset_name].href,
                    str(scene_folder / f"{output_name}.tif"),
                )
                download_tasks.append(task)

            download_results = await asyncio.gather(*download_tasks)

            if not all(download_results):
                logger.error(
                    f"Fallo en la descarga de una o más bandas para la escena {scene.id}"
                )
                # Aquí podrías agregar lógica para limpiar archivos parciales si lo deseas
                return None

            logger.info(f"Descarga completada para la escena {scene.id}")
            band_paths = {
                output_name: str(scene_folder / f"{output_name}.tif")
                for output_name in set(collection_map["output_names"].values())
            }

            # Gracias al mapeo en `output_names`, los archivos de salida siempre se llamarán
            # B04.tif y B08.tif, sin importar la fuente.
            return {
                "id": scene.id,
                "datetime": scene.datetime,
                "collection": collection_id,  # Es útil devolver de qué colección vino
                "folder": str(scene_folder),
                "b4_path": band_paths["B04"],
                "b8_path": band_paths["B08"],
                "band_paths": band_paths,
            }

        except KeyError as e:
            logger.error(
                f"Error procesando nueva escena {scene.id}: No se encontró el asset esperado '{e}' en la colección '{scene.collection_id}'."
            )
            return None
        except Exception as e:
            logger.error(f"Error inesperado procesando la escena {scene.id}: {str(e)}")
            return None

    def _get_scene_date(self, tif_path: str) -> Optional[datetime]:
        """Extrae la fecha de adquisición de un TIFF"""
        try:
            # Primero intentar con el archivo metadata.json en la misma carpeta
            scene_dir = Path(tif_path).parent
            metadata_path = scene_dir / "metadata.json"

            if metadata_path.exists():
                with open(metadata_path) as f:
                    metadata = json.load(f)
                    # Intentar obtener de properties.datetime primero
                    if (
                        "properties" in metadata
                        and "datetime" in metadata["properties"]
                    ):
                        return datetime.fromisoformat(
                            metadata["properties"]["datetime"].replace("Z", "+00:00")
                        )
                    # Si no, de la fecha directa
                    if "date" in metadata:
                        return datetime.fromisoformat(
                            metadata["date"].replace("Z", "+00:00")
                        )

            # Si no hay metadata.json o no tiene fecha, buscar en los tags del TIFF
            with rasterio.open(tif_path) as src:
                # Probar diferentes tags posibles
                for tag in ["TIFFTAG_DATETIME", "ACQUISITION_DATE", "LANDSAT_SCENE_ID"]:
                    if tag in src.tags():
                        if tag == "LANDSAT_SCENE_ID":
                            # Extraer fecha del scene_id (ej: LC08_L1TP_226084_20220522_20220527_02_T1)
                            scene_id = src.tags()[tag]
                            date_str = scene_id.split("_")[
                                3
                            ]  # El cuarto segmento es la fecha YYYYMMDD
                            return datetime.strptime(date_str, "%Y%m%d")
                        else:
                            return datetime.strptime(
                                src.tags()[tag], "%Y:%m:%d %H:%M:%S"
                            )

        except Exception as e:
            logger.warning(f"Error obteniendo fecha de escena: {str(e)}")

        return None

    def _is_scene_processed(
        self,
        scene_datetime: datetime,
        job_datetime: Optional[datetime],
        scene_collection: Optional[str] = None,
        job_collection: Optional[str] = None,
        force_render: bool = False,
        exact_scene_date: bool = False,
    ) -> bool:
        """
        Verifica si una escena ya fue procesada, comparando solo la parte de la fecha (día/mes/año).
        """
        if job_datetime is None or scene_datetime is None:
            return False

        if exact_scene_date and scene_datetime.date() != job_datetime.date():
            logger.warning(
                "Backfill exacto rechazado: la escena encontrada "
                f"({scene_datetime.date()}) no coincide con la solicitada "
                f"({job_datetime.date()})."
            )
            return True

        if force_render and scene_datetime.date() >= job_datetime.date():
            logger.info(
                "Reproceso visual solicitado: se permite recalcular la escena "
                f"{scene_datetime.date()}."
            )
            return False

        logger.info(
            "Verificando si la escena es mas antigua que la del ultimo job procesado."
        )
        logger.info(f"  -> Fecha de escena encontrada: {scene_datetime.date()}")
        logger.info(f"  -> Fecha de último job: {job_datetime.date()}")

        if scene_datetime.date() <= job_datetime.date():
            if self._is_quality_replacement(
                scene_datetime, job_datetime, scene_collection, job_collection
            ):
                logger.info(
                    "Escena anterior permitida como reemplazo de calidad "
                    f"({scene_collection} mejora {job_collection})."
                )
                return False
            logger.info(
                f"La escena ({scene_datetime.date()}) es anterior o igual a la del job ({job_datetime.date()}). Saltando tarea para evitar usar datos viejos."
            )
            return True

        logger.info(
            "La escena es mas reciente que la del ultimo job. Se procedera con el procesamiento."
        )
        return False

    def _is_quality_replacement(
        self,
        scene_datetime: Optional[datetime],
        job_datetime: Optional[datetime],
        scene_collection: Optional[str],
        job_collection: Optional[str],
    ) -> bool:
        if not scene_datetime or not job_datetime:
            return False
        if not job_collection:
            return False
        if self._collection_priority(scene_collection) >= self._collection_priority(
            job_collection
        ):
            return False
        days_delta = (job_datetime.date() - scene_datetime.date()).days
        return 0 <= days_delta <= SAT_SENTINEL_PREFERENCE_DAYS

    async def _process_ndvi(
        self, lote_id: str, polygon: Polygon, scene_data: dict
    ) -> Optional[dict]:
        """Procesa el cálculo de NDVI y recortes"""
        lote_folder = Path(DOWNLOAD_FOLDER) / lote_id
        lote_folder.mkdir(exist_ok=True)

        try:
            # Verificar georreferenciación primero
            for band in ["b4_path", "b8_path"]:
                with rasterio.open(scene_data[band]) as src:
                    if src.transform.is_identity:
                        logger.error(
                            f"{band} no esta georreferenciado (transformacion identidad)"
                        )
                        return None

            # Recortar bandas al polígono
            b4_recorte = lote_folder / "B04_recorte.tif"
            b8_recorte = lote_folder / "B08_recorte.tif"

            await asyncio.gather(
                self._run_in_executor(
                    recortar_ndvi, scene_data["b4_path"], polygon, str(b4_recorte)
                ),
                self._run_in_executor(
                    recortar_ndvi, scene_data["b8_path"], polygon, str(b8_recorte)
                ),
            )

            recorte_band_paths = {
                "B04": str(b4_recorte),
                "B08": str(b8_recorte),
            }
            for band_name, band_path in scene_data.get("band_paths", {}).items():
                if band_name in recorte_band_paths:
                    continue
                output_path = lote_folder / f"{band_name}_recorte.tif"
                try:
                    recortado = await self._run_in_executor(
                        recortar_ndvi, band_path, polygon, str(output_path)
                    )
                    if recortado:
                        recorte_band_paths[band_name] = str(output_path)
                except Exception as e:
                    logger.warning(
                        f"No se pudo recortar banda opcional {band_name}: {e}"
                    )

            # Verificar que los recortes tengan datos válidos antes de continuar
            with rasterio.open(b4_recorte) as src:
                b4_data = src.read(1)
                if np.all(b4_data == src.nodata) or np.all(np.isnan(b4_data)):
                    logger.error(
                        f"El recorte de la banda Red para el lote {lote_id} no contiene datos válidos. El polígono podría estar fuera del área de datos de la escena."
                    )
                    return None

            # Calcular NDVI
            ndvi, profile = await self._run_in_executor(
                calcular_ndvi,
                str(b8_recorte),
                str(b4_recorte),
                scene_data.get("collection"),
            )

            # Verificar que el NDVI no sea completamente inválido
            if np.all(np.isnan(ndvi)):
                logger.error("El cálculo de NDVI resultó en todos valores inválidos")
                return None

            # Exportar GeoTIFF
            ndvi_tif = lote_folder / "ndvi.tif"
            await self._run_in_executor(exportar_geotiff, ndvi, profile, str(ndvi_tif))

            # Recortar NDVI
            ndvi_recorte = lote_folder / "ndvi_recorte.tif"
            if not await self._run_in_executor(
                recortar_ndvi, str(ndvi_tif), polygon, str(ndvi_recorte)
            ):
                raise RuntimeError("Fallo al recortar NDVI")

            try:
                indices_info = await self._run_in_executor(
                    calcular_indices_y_rasters,
                    recorte_band_paths,
                    scene_data.get("collection"),
                )
                indices = indices_info.get("indices", {})
                rasters = indices_info.get("rasters", {})
                quality_mask = indices_info.get("qualityMask", {})
            except Exception as e:
                logger.warning(f"No se pudieron calcular indices satelitales: {e}")
                indices = {}
                rasters = {}
                quality_mask = {}

            ndvi_promedio = validated_satellite_index_mean(indices, quality_mask)
            if ndvi_promedio is None:
                logger.warning(
                    "La escena no produce un NDVI interpretable: falta QA, "
                    "el valor esta fuera de rango o la cobertura valida es menor a "
                    f"{MIN_SATELLITE_VALID_COVERAGE_PCT:.0f}%."
                )
                return None

            return {
                "ndvi_tif": str(ndvi_tif),
                "ndvi_recorte": str(ndvi_recorte),
                "ndvi_promedio": ndvi_promedio,
                "indices": indices,
                "rasters": rasters,
                "quality_mask": quality_mask,
                "scene_datetime": scene_data["datetime"],
                "collection": scene_data["collection"],  # Colección de la escena
            }

        except Exception as e:
            logger.error(f"Error procesando NDVI para {lote_id}: {e}")
            return None

    async def _generate_outputs(
        self, lote_id: str, polygon: Polygon, ndvi_data: dict
    ) -> dict:
        """Genera salidas (PNG, metadata)"""
        lote_folder = Path(DOWNLOAD_FOLDER) / lote_id
        scene_key = self._scene_key(ndvi_data)
        safe_lote_id = self._safe_filename(lote_id)
        png_path = lote_folder / f"ndvi_{scene_key}_recorte.png"

        # Obtener metadata
        metadata = await self._run_in_executor(
            obtener_metadata_png_con_polygon, ndvi_data["ndvi_recorte"], polygon
        )
        metadata["loteId"] = lote_id
        metadata["renderVersion"] = SATELLITE_RENDER_VERSION
        metadata["renderStrategy"] = "fixed-index-scale-quality-masked"
        metadata["qualityMask"] = ndvi_data.get("quality_mask", {})

        exported = await self._export_index_images(lote_id, lote_folder, ndvi_data)
        imagenes = exported.get("imagenes", {})
        metadata["indicesStats"] = exported.get("stats", {})
        metadata["renderQa"] = exported.get("qa", {})
        metadata["renderChecksums"] = exported.get("checksums", {})
        metadata["renderConfig"] = exported.get("configs", {})

        # La imagen principal debe ser el raster NDVI por pixel. El PNG legado solo
        # queda como fallback si por algun motivo no se genero la capa por indice.
        url_png = imagenes.get("ndvi")
        local_path = str(png_path)
        if not url_png:
            try:
                await self._run_in_executor(
                    exportar_png_desde_tif_con_polygon,
                    ndvi_data["ndvi_recorte"],
                    str(png_path),
                    polygon,
                )
                nombre_archivo = f"{safe_lote_id}-ndvi-{scene_key}-{int(time.time())}"
                destino = f"{nombre_archivo}.png"
                url_png = await subir_a_storage(str(png_path), destino)
            except Exception as e:
                logger.warning(f"No se pudo guardar el PNG local de respaldo: {e}")
        return {
            "url_png": url_png,  # Puede ser None
            "ndvi_promedio": ndvi_data["ndvi_promedio"],
            "indices": ndvi_data.get("indices", {}),
            "imagenes": imagenes,
            "metadata": metadata,  # Metadata geográfica del NDVI recortado
            "fecha_imagen": ndvi_data["scene_datetime"].isoformat(),
            "coleccion": ndvi_data.get("collection", "desconocida"),
            "local_path": local_path,  # Ruta local para desarrollo
        }

    async def _export_index_images(
        self, lote_id: str, lote_folder: Path, ndvi_data: dict
    ) -> dict:
        """Genera y sube una imagen PNG por indice satelital disponible."""
        imagenes = {}
        stats = {}
        qa = {}
        checksums = {}
        configs = {}
        timestamp = int(time.time())
        scene_key = self._scene_key(ndvi_data)
        safe_lote_id = self._safe_filename(lote_id)
        for indice, raster in ndvi_data.get("rasters", {}).items():
            if raster is None:
                continue
            try:
                output_path = lote_folder / f"{indice}_{scene_key}_recorte.png"
                render_metadata = await self._run_in_executor(
                    exportar_png_desde_array_validado,
                    raster,
                    str(output_path),
                    indice,
                )
                imagenes[indice] = await subir_a_storage(
                    str(output_path),
                    f"{safe_lote_id}-{indice}-{scene_key}-{timestamp}.png",
                )
                stats[indice] = render_metadata.get("stats", {})
                qa[indice] = render_metadata.get("qa", {})
                checksums[indice] = render_metadata.get("checksum")
                configs[indice] = render_metadata.get("renderConfig", {})
            except Exception as e:
                logger.warning(f"No se pudo generar imagen {indice}: {e}")
        return {
            "imagenes": imagenes,
            "stats": stats,
            "qa": qa,
            "checksums": checksums,
            "configs": configs,
        }

    async def _notify_backend(self, lote_id: str, output_data: dict):
        """Notifica al backend; un POST fallido mantiene la tarea sin ACK."""
        try:
            ndvi_promedio = validated_satellite_index_mean(
                output_data.get("indices", {}),
                output_data.get("metadata", {}).get("qualityMask", {}),
            )
            if ndvi_promedio is None:
                raise PermanentTaskError(
                    "El reporte NDVI no tiene un promedio con QA y cobertura suficientes",
                    code="invalid_ndvi_quality",
                )

            # output_data['fecha_imagen'] es un string ISO, lo convertimos y truncamos.
            fecha_imagen_obj = datetime.fromisoformat(output_data["fecha_imagen"])
            fecha_imagen_truncada = fecha_imagen_obj.date().isoformat()

            payload = {
                "idLote": lote_id,
                "ndvi_url": output_data["url_png"],
                "ndvi_promedio": ndvi_promedio,
                "indices": output_data.get("indices", {}),
                "imagenes": output_data.get("imagenes", {}),
                "metadata": output_data["metadata"],
                "fecha": datetime.now(timezone.utc).isoformat(),
                "fechaImagen": fecha_imagen_truncada,
                "coleccion": output_data.get("coleccion", "desconocida"),
            }

            headers = {}
            if NDVI_WORKER_TOKEN:
                headers["X-Chaman-Worker-Token"] = NDVI_WORKER_TOKEN

            response = await self.http_client.post(
                f"{API_EXTERNA_URL}/ndvi/crear-reporte",
                json=payload,
                headers=headers,
                timeout=10.0,
            )
            response.raise_for_status()
            logger.info(f"Notificacion enviada para lote {lote_id}")
        except httpx.HTTPStatusError as error:
            status = error.response.status_code
            if 400 <= status < 500 and status not in {408, 425, 429}:
                raise PermanentTaskError(
                    f"El backend rechazo el reporte NDVI con HTTP {status}",
                    code=f"backend_http_{status}",
                ) from error
            raise TransientTaskError(
                f"El backend no pudo persistir el reporte NDVI (HTTP {status})",
                code=f"backend_http_{status}",
            ) from error
        except (httpx.TimeoutException, httpx.TransportError) as error:
            raise TransientTaskError(
                "No se pudo entregar el reporte NDVI al backend",
                code="backend_delivery_failed",
            ) from error
        except (KeyError, TypeError, ValueError) as error:
            raise PermanentTaskError(
                "El resultado NDVI no puede serializarse para el backend",
                code="invalid_backend_payload",
            ) from error

    async def _cleanup(self, lote_id: str):
        """Limpia archivos temporales del lote con reintentos"""
        lote_folder = Path(DOWNLOAD_FOLDER) / lote_id
        max_attempts = 3

        for attempt in range(max_attempts):
            try:
                if lote_folder.exists():
                    shutil.rmtree(lote_folder)
                    logger.info(f"Limpiados archivos temporales de {lote_id}")
                    break
            except Exception as e:
                if attempt == max_attempts - 1:
                    logger.error(f"Error limpiando {lote_id}: {e}")
                else:
                    await asyncio.sleep(1)

    async def _run_in_executor(self, func, *args):
        """Ejecuta funciones síncronas en executor"""
        return await asyncio.get_event_loop().run_in_executor(None, func, *args)

    async def run(self):
        """Bucle principal del worker"""
        await self.initialize()
        if self.task_queue is None:
            raise RuntimeError("La cola confiable NDVI no fue inicializada")
        while True:
            try:
                claim = await self.task_queue.claim()
                if claim is None:
                    await self.task_queue.wait_for_work()
                    continue
                result = await self.task_queue.execute(
                    claim,
                    self.process_task,
                    self._release_dedupe_reservation,
                )
                logger.info(
                    "Resultado de cola NDVI: %s (intento %s)",
                    result.outcome,
                    result.attempt,
                )
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(
                    "Error de infraestructura en el bucle NDVI (%s)",
                    type(e).__name__,
                )
                await asyncio.sleep(5)


async def main():
    # Iniciar servidor de salud
    start_health_server(PORT)

    logger.info("Iniciando NDVI Worker...")
    logger.info(f"Servidor de salud corriendo en puerto {PORT}")

    # Iniciar worker
    worker = NDVIWorker()
    try:
        await worker.run()
    except Exception as e:
        logger.critical(f"Error critico: {e}", exc_info=True)
        raise
    finally:
        await worker.http_client.aclose()
        logger.info("Worker detenido")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker detenido por usuario")
    except Exception as e:
        logger.critical(f"Error no manejado: {e}", exc_info=True)
        raise
