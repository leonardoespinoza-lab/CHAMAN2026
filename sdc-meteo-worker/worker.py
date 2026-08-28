import logging
import math
import time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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
    REPAIR_REQUEST,
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

RAW_SCALAR_VARIABLES = (
    "temperatureK",
    "dewPointK",
    "surfacePressurePa",
    "precipitationM",
    "shortwaveRadiationJm2",
    "thermalRadiationJm2",
    "windU10Ms",
    "windV10Ms",
    "skinTemperatureK",
    "snowCoverFraction",
    "snowDepthM",
)
RAW_LAYER_VARIABLES = ("soilTemperatureK", "soilWaterM3M3")
LEGACY_CALCULATION_VERSION = "chaman-meteo-agro-v1"
SUPPORTED_COUNTRY_CODES = frozenset(("AR", "UY", "PY", "BR", "CL"))


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
        points = self._all_grid_points()
        latest_available = self._latest_available_date()
        if REPAIR_REQUEST:
            self._run_repair(points, latest_available, REPAIR_REQUEST)
            STATE.last_run = datetime.now(timezone.utc).isoformat()
            STATE.last_error = None
            return
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
        point = self._validated_point(point)
        key = point["key"]
        lock = self.redis.lock(
            f"chaman-meteo:import:{key}", timeout=3 * 60 * 60, blocking_timeout=1
        )
        if not lock.acquire(blocking=False):
            logger.info("Punto %s ya esta siendo procesado", key)
            return
        try:
            coverage = self._get(
                f"coverage/{key}",
                params={
                    "calculationVersion": CALCULATION_VERSION,
                    "sourceVersion": SOURCE_VERSION,
                },
            ) or {}
            start = self._next_start(coverage, point)
            if start > latest_available:
                logger.info("Punto %s al dia", key)
                return
            end = min(
                latest_available,
                start + timedelta(days=BACKFILL_DAYS_PER_RUN - 1),
            )
            complete = self._import_range(point, start, end)
            if not complete:
                raise RuntimeError(
                    f"Importacion incompleta para {key} "
                    f"({start.isoformat()} a {end.isoformat()})"
                )
        finally:
            try:
                lock.release()
            except redis.exceptions.LockError:
                logger.warning("El lease Redis de %s vencio antes de finalizar", key)

    def _run_repair(
        self, points: list[dict], latest_available: date, request: dict
    ) -> None:
        key = request["gridPointKey"]
        point = next(
            (candidate for candidate in points if candidate.get("key") == key),
            None,
        )
        if not point:
            raise RuntimeError(f"Punto de reparacion inexistente: {key}")
        if point.get("enabled") is False:
            raise RuntimeError(f"Punto de reparacion deshabilitado: {key}")
        point = self._validated_point(point)
        start = request["start"]
        end = request["end"]
        if end > latest_available:
            raise RuntimeError(
                f"REPAIR_TO {end.isoformat()} supera la disponibilidad CDS "
                f"{latest_available.isoformat()}"
            )
        chunks = list(self._repair_chunks(start, end))
        logger.info(
            "Reparacion v2 solicitada para %s (%s a %s; %s segmentos; force=%s)",
            key,
            start,
            end,
            len(chunks),
            bool(request.get("force")),
        )
        for chunk_start, chunk_end in chunks:
            retrieval_start, retrieval_end = self._repair_retrieval_range(
                point, chunk_start, chunk_end, latest_available
            )
            self._run_repair_chunk(
                point,
                chunk_start,
                chunk_end,
                retrieval_start,
                retrieval_end,
                bool(request.get("force")),
            )

    def _run_repair_chunk(
        self,
        point: dict,
        start: date,
        end: date,
        retrieval_start: date,
        retrieval_end: date,
        force: bool,
    ) -> None:
        key = point["key"]
        lock = self.redis.lock(
            f"chaman-meteo:import:{key}", timeout=3 * 60 * 60, blocking_timeout=1
        )
        if not lock.acquire(blocking=False):
            raise RuntimeError(f"Punto {key} ya esta siendo procesado")
        try:
            complete = self._import_range(
                point,
                start,
                end,
                job_type="REPAIR",
                force=force,
                retrieval_start=retrieval_start,
                retrieval_end=retrieval_end,
            )
            if not complete:
                raise RuntimeError(
                    f"Segmento REPAIR {start.isoformat()}..{end.isoformat()} "
                    "quedo PARTIAL; revisar el job antes de continuar"
                )
        finally:
            try:
                lock.release()
            except redis.exceptions.LockError:
                logger.warning("El lease Redis de %s vencio antes de finalizar", key)

    def _import_range(
        self,
        point: dict,
        start: date,
        end: date,
        job_type: str = "BACKFILL",
        force: bool = False,
        retrieval_start: date | None = None,
        retrieval_end: date | None = None,
    ) -> bool:
        key = point["key"]
        retrieval_start = retrieval_start or start
        retrieval_end = retrieval_end or end
        job_key = self._job_key(key, start, end, job_type)
        existing = self._get("jobs/by-key", params={"jobKey": job_key})
        if existing and existing.get("status") == "AVAILABLE" and not force:
            # Coverage is the progress commit marker. A previous run may have
            # persisted AVAILABLE but lost the coverage response, so repair it
            # idempotently before treating any segment as complete.
            self._recalculate_coverage(key)
            logger.info(
                "%s %s ya disponible; se reconcilio coverage sin redescargar",
                job_type,
                job_key,
            )
            return True
        job = {
            "jobKey": job_key,
            "type": job_type,
            "gridPointKey": key,
            "sourceVersion": SOURCE_VERSION,
            "calculationVersion": CALCULATION_VERSION,
            "rangeStart": start.isoformat(),
            "rangeEnd": end.isoformat(),
            "retrievalStart": retrieval_start.isoformat(),
            "retrievalEnd": retrieval_end.isoformat(),
            "status": "DOWNLOADING",
            "progressPct": 5,
            "attempts": int((existing or {}).get("attempts") or 0) + 1,
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "heartbeatAt": datetime.now(timezone.utc).isoformat(),
        }
        self._post("jobs/upsert", job)
        try:
            raw = self.cds.retrieve(
                key,
                point["latitude"],
                point["longitude"],
                retrieval_start.isoformat(),
                retrieval_end.isoformat(),
                SOURCE_VERSION,
            )
            validation_errors = self._validate_download(
                raw, retrieval_start, retrieval_end
            )
            job.update(progressPct=55, recordsDownloaded=len(raw))
            self._post("jobs/upsert", job)
            if validation_errors:
                finished = datetime.now(timezone.utc).isoformat()
                diagnostic = "; ".join(validation_errors)[:1000]
                job.update(
                    status="PARTIAL",
                    progressPct=55,
                    recordsStored=0,
                    finishedAt=finished,
                    heartbeatAt=finished,
                    lastError=diagnostic,
                )
                self._post("jobs/upsert", job)
                logger.warning(
                    "Punto %s no persistido por descarga PARTIAL (%s a %s): %s",
                    key,
                    retrieval_start,
                    retrieval_end,
                    diagnostic,
                )
                return False
            derived = [
                derive_hourly(
                    record,
                    CALCULATION_VERSION,
                    NEGATIVE_PRECIPITATION_TOLERANCE_MM,
                )
                for record in raw
            ]
            for chunk in self._chunks(raw, 500):
                self._post("hourly/raw/versions/upsert-many", chunk)
            for chunk in self._chunks(derived, 500):
                self._post("hourly/derived/upsert-many", chunk)
            daily = []
            window = daily_utc_window(derived, point["timezone"])
            if window:
                persisted = self._hourly_range(key, window[0], window[1])
                daily = aggregate_daily(
                    persisted,
                    point["timezone"],
                    CALCULATION_VERSION,
                )
                minimum_daily_date = self._historical_start(point).isoformat()
                daily = [
                    record
                    for record in daily
                    if record.get("date", "") >= minimum_daily_date
                ]
                if job_type == "REPAIR":
                    requested_start = start.isoformat()
                    requested_end = end.isoformat()
                    daily = [
                        record
                        for record in daily
                        if requested_start
                        <= record.get("date", "")
                        <= requested_end
                    ]
            for chunk in self._chunks(daily, 200):
                self._post("daily/upsert-many", chunk)
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
            if job_type == "REPAIR":
                raise RuntimeError(safe_error) from error
            return False

        finished = datetime.now(timezone.utc).isoformat()
        job.update(
            status="AVAILABLE",
            progressPct=100,
            recordsStored=len(derived),
            finishedAt=finished,
            heartbeatAt=finished,
            lastError=None,
        )
        try:
            # Persist the job first and coverage last. Coverage is the durable
            # progress marker used by the next cycle. If either response is lost,
            # the operation remains retryable without downgrading an already
            # committed AVAILABLE job to FAILED.
            self._post("jobs/upsert", job)
            self._recalculate_coverage(key)
        except Exception as error:
            safe_error = self._safe_error(error)
            logger.error(
                "Punto %s quedo pendiente de finalizacion y se reintentara: %s",
                key,
                safe_error,
            )
            if job_type == "REPAIR":
                raise RuntimeError(safe_error) from error
            return False

        logger.info(
            "Punto %s: %s horas importadas (%s a %s)",
            key,
            len(raw),
            retrieval_start,
            retrieval_end,
        )
        return True

    def _recalculate_coverage(self, key: str) -> None:
        self._post(
            f"coverage/{key}/recalculate",
            {
                "calculationVersion": CALCULATION_VERSION,
                "sourceVersion": SOURCE_VERSION,
            },
        )

    def _job_key(
        self, grid_point_key: str, start: date, end: date, job_type: str
    ) -> str:
        return (
            f"{grid_point_key}:{start.isoformat()}:{end.isoformat()}:"
            f"{job_type}:{SOURCE_VERSION}:{CALCULATION_VERSION}"
        )

    def _repair_retrieval_range(
        self, point: dict, start: date, end: date, latest_available: date
    ) -> tuple[date, date]:
        lower_bound = self._historical_start(point)
        if start < lower_bound:
            raise RuntimeError(
                f"REPAIR_FROM {start.isoformat()} es anterior al inicio "
                f"permitido {lower_bound.isoformat()} para {point.get('key', 'punto')}"
            )
        # One UTC calendar-day halo on each side covers every local day in the
        # supported South-American timezones, including 23/25-hour DST days.
        return (
            max(lower_bound, start - timedelta(days=1)),
            min(latest_available, end + timedelta(days=1)),
        )

    def _repair_chunks(self, start: date, end: date):
        cursor = start
        while cursor <= end:
            chunk_end = min(
                end, cursor + timedelta(days=BACKFILL_DAYS_PER_RUN - 1)
            )
            yield cursor, chunk_end
            cursor = chunk_end + timedelta(days=1)

    def _validate_download(
        self, raw: list[dict], retrieval_start: date, retrieval_end: date
    ) -> list[str]:
        expected_start = datetime.combine(
            retrieval_start, datetime.min.time(), tzinfo=timezone.utc
        )
        expected_end = datetime.combine(
            retrieval_end + timedelta(days=1),
            datetime.min.time(),
            tzinfo=timezone.utc,
        )
        expected_timestamps = set()
        cursor = expected_start
        while cursor < expected_end:
            expected_timestamps.add(cursor)
            cursor += timedelta(hours=1)

        actual_timestamps = set()
        valid_timestamp_rows = 0
        invalid_timestamps = 0
        missing_by_variable = {
            **{field: 0 for field in RAW_SCALAR_VARIABLES},
            **{
                f"{field}[{index}]": 0
                for field in RAW_LAYER_VARIABLES
                for index in range(1, 5)
            },
        }
        for record in raw:
            try:
                timestamp = datetime.fromisoformat(
                    str(record.get("timestamp") or "").replace("Z", "+00:00")
                )
                if timestamp.tzinfo is None:
                    raise ValueError("timestamp sin zona horaria")
                timestamp = timestamp.astimezone(timezone.utc)
                valid_timestamp_rows += 1
                actual_timestamps.add(timestamp)
            except (TypeError, ValueError):
                invalid_timestamps += 1
            values = record.get("values") or {}
            for field in RAW_SCALAR_VARIABLES:
                if not self._finite(values.get(field)):
                    missing_by_variable[field] += 1
            for field in RAW_LAYER_VARIABLES:
                layers = values.get(field)
                for index in range(4):
                    value = (
                        layers[index]
                        if isinstance(layers, list) and len(layers) > index
                        else None
                    )
                    if not self._finite(value):
                        missing_by_variable[f"{field}[{index + 1}]"] += 1

        diagnostics = []
        missing_hours = len(expected_timestamps - actual_timestamps)
        extra_hours = len(actual_timestamps - expected_timestamps)
        duplicate_hours = valid_timestamp_rows - len(actual_timestamps)
        if missing_hours or extra_hours or invalid_timestamps or duplicate_hours:
            diagnostics.append(
                "hour_coverage "
                f"expected={len(expected_timestamps)} actual={len(actual_timestamps)} "
                f"missing={missing_hours} extra={extra_hours} "
                f"invalid={invalid_timestamps} duplicates={duplicate_hours}"
            )
        incomplete = [
            f"{field}={count}"
            for field, count in missing_by_variable.items()
            if count
        ]
        if incomplete:
            diagnostics.append("missing_values " + ",".join(incomplete))
        return diagnostics

    def _finite(self, value) -> bool:
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        )

    def _next_start(self, coverage: dict, point: dict) -> date:
        historical_start = self._historical_start(point)
        coverage_version = str(coverage.get("calculationVersion") or "").strip()
        coverage_source = str(coverage.get("sourceVersion") or "").strip()
        if coverage_version and coverage_version != CALCULATION_VERSION:
            return historical_start
        if coverage_version == CALCULATION_VERSION and coverage_source != SOURCE_VERSION:
            return historical_start

        if coverage_version == CALCULATION_VERSION:
            first = self._coverage_date(coverage.get("hourlyDerivedFrom"))
            if first is None or first > historical_start:
                return historical_start
            last = coverage.get("hourlyDerivedTo")
        elif CALCULATION_VERSION == LEGACY_CALCULATION_VERSION:
            # Compatibility only for pre-versioned v1 coverage. Newer engines
            # must never infer their progress from shared raw records.
            last = coverage.get("hourlyDerivedTo") or coverage.get("hourlyRawTo")
        else:
            return historical_start

        if not last:
            return historical_start
        try:
            parsed = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
        except ValueError:
            return historical_start
        return (parsed + timedelta(hours=1)).date()

    def _coverage_date(self, value) -> date | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(
                str(value).replace("Z", "+00:00")
            ).date()
        except ValueError:
            return None

    def _historical_start(self, point: dict) -> date:
        value = str(point.get("historicalStart") or HISTORICAL_START)
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise RuntimeError(
                f"historicalStart invalido para {point.get('key', 'punto')}"
            ) from error
        if parsed < date(2020, 1, 1) or parsed > date.today():
            raise RuntimeError(
                f"historicalStart fuera de rango para {point.get('key', 'punto')}"
            )
        return max(parsed, date.fromisoformat(HISTORICAL_START))

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

    def _all_grid_points(self) -> list[dict]:
        records = []
        seen_keys = set()
        offset = 0
        limit = 500
        while True:
            page = self._get(
                "grid-points",
                params={"limit": limit, "offset": offset},
            )
            batch = page.get("datos", [])
            total = int(page.get("total", len(records) + len(batch)))
            if not batch:
                if len(records) < total:
                    raise RuntimeError(
                        "Paginacion de puntos termino antes del total informado"
                    )
                return records
            new_records = []
            for point in batch:
                key = str(point.get("key") or "")
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                new_records.append(point)
            if not new_records:
                raise RuntimeError(
                    "Paginacion de puntos repetida; se detiene para evitar un ciclo infinito"
                )
            records.extend(new_records)
            if len(records) >= total:
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
            point = self._validated_point(point)
            payload = {
                "key": point["key"],
                "latitude": point["latitude"],
                "longitude": point["longitude"],
                "countryCode": point["countryCode"],
                "timezone": point["timezone"],
                "enabled": point.get("enabled", True),
                "provider": "copernicus-cds",
                "dataset": "reanalysis-era5-land-timeseries",
                "historicalStart": point.get("historicalStart") or HISTORICAL_START,
            }
            self._post("grid-points/upsert", payload)

    def _validated_point(self, point: dict) -> dict:
        if not isinstance(point, dict):
            raise RuntimeError("Punto meteorologico debe ser un objeto")
        key = str(point.get("key") or "").strip()
        if not key:
            raise RuntimeError("Punto meteorologico sin key")
        try:
            latitude = float(point.get("latitude"))
            longitude = float(point.get("longitude"))
        except (TypeError, ValueError) as error:
            raise RuntimeError(f"Coordenadas invalidas para {key}") from error
        if not math.isfinite(latitude) or not -90.0 <= latitude <= 90.0:
            raise RuntimeError(f"Latitud fuera de rango para {key}")
        if not math.isfinite(longitude) or not -180.0 <= longitude <= 180.0:
            raise RuntimeError(f"Longitud fuera de rango para {key}")
        country_code = str(point.get("countryCode") or "").strip().upper()
        if country_code not in SUPPORTED_COUNTRY_CODES:
            raise RuntimeError(f"countryCode invalido para {key}")
        timezone_name = str(point.get("timezone") or "").strip()
        if not timezone_name:
            raise RuntimeError(f"timezone requerido para {key}")
        try:
            ZoneInfo(timezone_name)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise RuntimeError(f"timezone IANA invalido para {key}") from error
        self._historical_start(point)
        return {
            **point,
            "key": key,
            "latitude": latitude,
            "longitude": longitude,
            "countryCode": country_code,
            "timezone": timezone_name,
        }

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


def main() -> int:
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
        return 0 if not CHAMAN_METEO_ENABLED or not CHAMAN_METEO_IMPORT_ENABLED else 1
    while True:
        cycle_failed = False
        try:
            worker.run_cycle()
        except Exception as error:
            cycle_failed = True
            STATE.last_error = redact_secret(error)
            logger.exception("Fallo del ciclo Chaman-Meteo")
        if RUN_ONCE:
            return 1 if cycle_failed or STATE.last_error else 0
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
