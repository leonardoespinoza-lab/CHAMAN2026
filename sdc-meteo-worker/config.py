import json
import os
from datetime import date


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() == "true"


def locked_version(name: str, expected: str) -> str:
    value = os.getenv(name, expected)
    if value != expected:
        raise RuntimeError(
            f"{name} debe ser exactamente {expected}; "
            "esta imagen no puede etiquetar el algoritmo v2 con otra version"
        )
    return value


CHAMAN_METEO_ENABLED = env_bool("CHAMAN_METEO_ENABLED")
CHAMAN_METEO_IMPORT_ENABLED = (
    CHAMAN_METEO_ENABLED and env_bool("CHAMAN_METEO_IMPORT_ENABLED")
)
CDS_API_URL = os.getenv(
    "CDS_API_URL", "https://cds.climate.copernicus.eu/api"
).rstrip("/")
if CDS_API_URL != "https://cds.climate.copernicus.eu/api":
    raise RuntimeError("CDS_API_URL debe usar el endpoint oficial de Copernicus")
CDS_API_KEY = os.getenv("CDS_API_KEY", "").strip()
API_DATOS = os.getenv("API_DATOS", "http://127.0.0.1:5000").rstrip("/")
INTERNAL_TOKEN = os.getenv(
    "CHAMAN_METEO_INTERNAL_TOKEN", os.getenv("AGROMETEO_INTERNAL_TOKEN", "")
).strip()
HISTORICAL_START = os.getenv("CHAMAN_METEO_HISTORICAL_START", "2020-01-01").strip()
try:
    historical_start_date = date.fromisoformat(HISTORICAL_START)
except ValueError as error:
    raise RuntimeError(
        "CHAMAN_METEO_HISTORICAL_START debe usar el formato YYYY-MM-DD"
    ) from error
if (
    historical_start_date < date(2020, 1, 1)
    or historical_start_date > date.today()
):
    raise RuntimeError(
        "CHAMAN_METEO_HISTORICAL_START debe estar entre 2020-01-01 y hoy"
    )
CALCULATION_VERSION = locked_version(
    "CHAMAN_METEO_CALCULATION_VERSION", "chaman-meteo-agro-v2"
)
SOURCE_VERSION = locked_version(
    "CHAMAN_METEO_SOURCE_VERSION", "era5-land-timeseries-19var-v2"
)
POLL_SECONDS = max(300, int(os.getenv("CHAMAN_METEO_POLL_SECONDS", "21600")))
BACKFILL_DAYS_PER_RUN = max(
    1, min(366, int(os.getenv("CHAMAN_METEO_BACKFILL_DAYS_PER_RUN", "31")))
)
HTTP_TIMEOUT_SECONDS = max(
    5, min(300, int(os.getenv("CHAMAN_METEO_HTTP_TIMEOUT_SECONDS", "60")))
)
try:
    NEGATIVE_PRECIPITATION_TOLERANCE_MM = float(
        os.getenv("CHAMAN_METEO_NEGATIVE_PRECIPITATION_TOLERANCE_MM", "0.001")
    )
except ValueError as error:
    raise RuntimeError(
        "CHAMAN_METEO_NEGATIVE_PRECIPITATION_TOLERANCE_MM debe ser numerico"
    ) from error
if not 0 <= NEGATIVE_PRECIPITATION_TOLERANCE_MM <= 1:
    raise RuntimeError(
        "CHAMAN_METEO_NEGATIVE_PRECIPITATION_TOLERANCE_MM debe estar entre 0 y 1"
    )
RUN_ONCE = env_bool("CHAMAN_METEO_RUN_ONCE")
REPAIR_FORCE = env_bool("CHAMAN_METEO_REPAIR_FORCE")
PORT = int(os.getenv("PORT", "5000"))
DOWNLOAD_DIR = os.getenv("CHAMAN_METEO_DOWNLOAD_DIR", "/tmp/chaman-meteo")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_DB = int(os.getenv("REDIS_METEO_DB", os.getenv("REDIS_DB", "0")))


def configured_points() -> list[dict]:
    raw = os.getenv("CHAMAN_METEO_GRID_POINTS_JSON", "[]")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError("CHAMAN_METEO_GRID_POINTS_JSON no es JSON valido") from error
    if not isinstance(data, list):
        raise RuntimeError("CHAMAN_METEO_GRID_POINTS_JSON debe ser una lista")
    return data


def configured_repair() -> dict | None:
    """Return one explicit repair request or fail closed on partial configuration."""
    raw = {
        "gridPointKey": os.getenv("CHAMAN_METEO_REPAIR_GRID_POINT", "").strip(),
        "from": os.getenv("CHAMAN_METEO_REPAIR_FROM", "").strip(),
        "to": os.getenv("CHAMAN_METEO_REPAIR_TO", "").strip(),
    }
    configured = [bool(value) for value in raw.values()]
    if not any(configured):
        if REPAIR_FORCE:
            raise RuntimeError(
                "CHAMAN_METEO_REPAIR_FORCE requiere una reparacion explicita"
            )
        return None
    if not all(configured):
        raise RuntimeError(
            "La reparacion requiere CHAMAN_METEO_REPAIR_GRID_POINT, "
            "CHAMAN_METEO_REPAIR_FROM y CHAMAN_METEO_REPAIR_TO"
        )
    if not RUN_ONCE:
        raise RuntimeError(
            "La reparacion requiere CHAMAN_METEO_RUN_ONCE=true para no repetirse"
        )
    try:
        start = date.fromisoformat(raw["from"])
        end = date.fromisoformat(raw["to"])
    except ValueError as error:
        raise RuntimeError(
            "CHAMAN_METEO_REPAIR_FROM/TO deben usar el formato YYYY-MM-DD"
        ) from error
    if start < historical_start_date or end > date.today():
        raise RuntimeError(
            "El rango de reparacion no puede comenzar antes de "
            "CHAMAN_METEO_HISTORICAL_START ni terminar despues de hoy"
        )
    if start > end:
        raise RuntimeError(
            "CHAMAN_METEO_REPAIR_FROM debe ser anterior o igual a REPAIR_TO"
        )
    return {
        "gridPointKey": raw["gridPointKey"],
        "start": start,
        "end": end,
        "force": REPAIR_FORCE,
    }


REPAIR_REQUEST = configured_repair()
if REPAIR_REQUEST and (
    not CHAMAN_METEO_ENABLED or not CHAMAN_METEO_IMPORT_ENABLED
):
    raise RuntimeError(
        "La reparacion requiere CHAMAN_METEO_ENABLED=true y "
        "CHAMAN_METEO_IMPORT_ENABLED=true"
    )
