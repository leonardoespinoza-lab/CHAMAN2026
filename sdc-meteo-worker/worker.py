import logging
import time
from datetime import date, datetime, timedelta, timezone

import redis
import requests

from calculations import aggregate_daily, daily_utc_window, derive_hourly
from cds_client import CdsTimeSeriesClient
from config import (
    API_DATOS,
    BACKFILL_DAYS_PER_RUN,
    CALCULATION_VERSION,
    CDS_API_KEY,
    CDS_API_URL,
    CHAMAN_METEO_ENABLED,
    CHAMAN_METEO_IMPORT_ENABLED,
    DOWNLOAD_DIR,
    HISTORICAL_START,
    HTTP_TIMEOUT_SECONDS,
    INTERNAL_TOKEN,
    NEGATIVE_PRECIPITATION_TOLERANCE_MM,
    POLL_SECONDS,
    PORT,
    REDIS_DB,
    REDIS_HOST,
    REDIS_PASSWORD,
    REDIS_PORT,
    RUN_ONCE,
    SOURCE_VERSION,
    configured_points,
)
from health import STATE, start_health_server


logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger("chaman-meteo")


def redact_secret(value) -> str:
    text = str(value)
    return text.replace(CDS_API_KEY, "[REDACTED]") if CDS_API_KEY else text


class ChamanMeteoWorker:
    def __init__(self):
        self.session = requests.Session()
        if INTERNAL_TOKEN:
            self.session.headers["x-chaman-internal-token"] = INTERNAL_TOKEN
        self.redis = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD or None,
            db=REDIS_DB,
            socket_connect_timeout=5,
            decode_responses=True,
        )
        self.cds = None

    def initialize(self):
        if not CHAMAN_METEO_ENABLED or not CHAMAN_METEO_IMPORT_ENABLED:
            raise RuntimeError("Importador desactivado por feature flags")
        if not CDS_API_KEY:
            raise RuntimeError("CDS_API_KEY no configurada")
        if not INTERNAL_TOKEN:
            raise RuntimeError("CHAMAN_METEO_INTERNAL_TOKEN no configurado")
        self.cds = CdsTimeSeriesClient(CDS_API_URL, CDS_API_KEY, DOWNLOAD_DIR)
        self.redis.ping()
        self._seed_configured_points()
        STATE.healthy = True
        STATE.ready = True
        logger.info(
            "Worker listo: CDS configurado, importacion habilitada, secreto protegido"
        )

    def run_cycle(self):
        points = self._get("grid-points", params={"limit": 500}).get("datos", [])
        latest_available = self._latest_available_date()
        logger.info("Ciclo iniciado para %s puntos; CDS disponible hasta %s", len(points), latest_available)
        errors = []
        for point in points:
            if point.get("enabled") is False:
                continue
            try:
                self._process_point(point, latest_available)
            except Exception as error:
                safe_error = self._safe_error(error)
                errors.append(f"{point.get('key', 'desconocido')}: {safe_error}")
                logger.error(
                    "Punto %s fallo antes de importar: %s",
                    point.get("key", "desconocido"),
                    safe_error,
                )
        STATE.last_run = datetime.now(timezone.utc).isoformat()
        STATE.last_error = "; ".join(errors)[:1000] if errors else None

    def _process_point(self, point: dict, latest_available: date):
        key = point["key"]
        lock = self.redis.lock(
            f"chaman-meteo:import:{key}", timeout=3 * 60 * 60, blocking_timeout=1
        )
        if not lock.acquire(blocking=False):
            logger.info("Punto %s ya esta siendo procesado", key)
            return
        try:
            coverage = self._get(f"coverage/{key}") or {}
            start = self._next_start(coverage, point)
            if start > latest_available:
                logger.info("Punto %s al dia", key)
                return
            end = min(
                latest_available,
                start + timedelta(days=BACKFILL_DAYS_PER_RUN - 1),
            )
            self._import_range(point, start, end)
        finally:
            try:
                lock.release()
            except redis.exceptions.LockError:
                logger.warning("El lease Redis de %s vencio antes de finalizar", key)

    def _import_range(self, point: dict, start: date, end: date):
        key = point["key"]
        job_key = f"{key}:{start.isoformat()}:{end.isoformat()}:{SOURCE_VERSION}"
        job = {
            "jobKey": job_key,
            "type": "BACKFILL",
            "gridPointKey": key,
            "rangeStart": start.isoformat(),
            "rangeEnd": end.isoformat(),
            "status": "DOWNLOADING",
            "progressPct": 5,
            "attempts": 1,
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "heartbeatAt": datetime.now(timezone.utc).isoformat(),
        }
        self._post("jobs/upsert", job)
        try:
            raw = self.cds.retrieve(
                key,
                point["latitude"],
                point["longitude"],
                start.isoformat(),
                end.isoformat(),
                SOURCE_VERSION,
            )
            job.update(progressPct=55, recordsDownloaded=len(raw))
            self._post("jobs/upsert", job)
            derived = [
                derive_hourly(
                    record,
                    CALCULATION_VERSION,
                    NEGATIVE_PRECIPITATION_TOLERANCE_MM,
                )
                for record in raw
            ]
            for chunk in self._chunks(raw, 500):
                self._post("hourly/raw/upsert-many", chunk)
            for chunk in self._chunks(derived, 500):
                self._post("hourly/derived/upsert-many", chunk)
            daily = []
            window = daily_utc_window(
                derived, point.get("timezone") or "UTC"
            )
            if window:
                persisted = self._hourly_range(key, window[0], window[1])
                daily = aggregate_daily(
                    persisted,
                    point.get("timezone") or "UTC",
                    CALCULATION_VERSION,
                )
            for chunk in self._chunks(daily, 200):
                self._post("daily/upsert-many", chunk)
            finished = datetime.now(timezone.utc).isoformat()
            self._post(f"coverage/{key}/recalculate", {})
            job.update(
                status="AVAILABLE",
                progressPct=100,
                recordsStored=len(derived),
                finishedAt=finished,
                heartbeatAt=finished,
                lastError=None,
            )
            self._post("jobs/upsert", job)
            logger.info("Punto %s: %s horas importadas (%s a %s)", key, len(raw), start, end)
        except Exception as error:
            safe_error = self._safe_error(error)
            job.update(
                status="FAILED",
                lastError=safe_error,
                heartbeatAt=datetime.now(timezone.utc).isoformat(),
                finishedAt=datetime.now(timezone.utc).isoformat(),
            )
            self._post("jobs/upsert", job)
            logger.error("Punto %s fallo: %s", key, safe_error)

    def _next_start(self, coverage: dict, point: dict) -> date:
        last = coverage.get("hourlyRawTo")
        if not last:
            return self._historical_start(point)
        parsed = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
        return (parsed + timedelta(hours=1)).date()

    def _historical_start(self, point: dict) -> date:
        value = str(point.get("historicalStart") or HISTORICAL_START)
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise RuntimeError(
                f"historicalStart invalido para {point.get('key', 'punto')}"
            ) from error
        if parsed < date(1950, 1, 2) or parsed > date.today():
            raise RuntimeError(
                f"historicalStart fuera de rango para {point.get('key', 'punto')}"
            )
        return parsed

    def _hourly_range(
        self, grid_point_key: str, from_time: str, to_exclusive: str
    ) -> list[dict]:
        records = []
        offset = 0
        while True:
            page = self._get(
                "hourly",
                params={
                    "gridPointKey": grid_point_key,
                    "calculationVersion": CALCULATION_VERSION,
                    "from": from_time,
                    "toExclusive": to_exclusive,
                    "limit": 500,
                    "offset": offset,
                },
            )
            batch = page.get("datos", [])
            records.extend(batch)
            total = int(page.get("total", len(records)))
            if not batch or len(records) >= total:
                return records
            offset += len(batch)

    def _latest_available_date(self) -> date:
        try:
            catalogue = requests.get(
                "https://cds.climate.copernicus.eu/api/catalogue/v1/collections/reanalysis-era5-land-timeseries",
                timeout=HTTP_TIMEOUT_SECONDS,
            ).json()
            constraints_url = next(
                item["href"] for item in catalogue["links"] if item["rel"] == "constraints"
            )
            constraints = requests.get(
                constraints_url, timeout=HTTP_TIMEOUT_SECONDS
            ).json()
            latest = constraints[0]["date"][0].split("/")[-1]
            return date.fromisoformat(latest)
        except Exception:
            return datetime.now(timezone.utc).date() - timedelta(days=7)

    def _seed_configured_points(self):
        for point in configured_points():
            payload = {
                "key": str(point["key"]),
                "latitude": float(point["latitude"]),
                "longitude": float(point["longitude"]),
                "countryCode": point.get("countryCode"),
                "timezone": point.get("timezone") or "UTC",
                "enabled": point.get("enabled", True),
                "provider": "copernicus-cds",
                "dataset": "reanalysis-era5-land-timeseries",
                "historicalStart": point.get("historicalStart") or HISTORICAL_START,
            }
            self._post("grid-points/upsert", payload)

    def _get(self, path: str, params=None):
        response = self.session.get(
            f"{API_DATOS}/chaman-meteo-internal/{path}",
            params=params,
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return self._response_json(response)

    def _post(self, path: str, payload):
        response = self.session.post(
            f"{API_DATOS}/chaman-meteo-internal/{path}",
            json=payload,
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return self._response_json(response)

    def _put(self, path: str, payload):
        response = self.session.put(
            f"{API_DATOS}/chaman-meteo-internal/{path}",
            json=payload,
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return self._response_json(response)

    def _response_json(self, response):
        if not response.content or not response.text.strip():
            return {}
        try:
            return response.json()
        except requests.exceptions.JSONDecodeError as error:
            content_type = response.headers.get("content-type", "desconocido")
            raise RuntimeError(
                f"Respuesta interna no JSON (status={response.status_code}, content-type={content_type})"
            ) from error

    def _chunks(self, values: list, size: int):
        for index in range(0, len(values), size):
            yield values[index : index + size]

    def _safe_error(self, error: Exception) -> str:
        return redact_secret(error)[:1000]


def main():
    start_health_server(PORT)
    worker = ChamanMeteoWorker()
    try:
        worker.initialize()
    except Exception as error:
        if not CHAMAN_METEO_ENABLED or not CHAMAN_METEO_IMPORT_ENABLED:
            STATE.healthy = True
            STATE.last_error = None
            logger.info("Worker en espera: importador desactivado por feature flags")
        else:
            STATE.last_error = redact_secret(error)
            logger.error("Worker no iniciado: %s", STATE.last_error)
        while not RUN_ONCE:
            time.sleep(60)
        return
    while True:
        try:
            worker.run_cycle()
        except Exception as error:
            STATE.last_error = redact_secret(error)
            logger.exception("Fallo del ciclo Chaman-Meteo")
        if RUN_ONCE:
            break
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
