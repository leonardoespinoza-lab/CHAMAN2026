import json
import os
from datetime import date


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() == "true"


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
if historical_start_date < date(1950, 1, 2) or historical_start_date > date.today():
    raise RuntimeError(
        "CHAMAN_METEO_HISTORICAL_START debe estar entre 1950-01-02 y hoy"
    )
CALCULATION_VERSION = os.getenv(
    "CHAMAN_METEO_CALCULATION_VERSION", "chaman-meteo-agro-v1"
)
SOURCE_VERSION = os.getenv("CHAMAN_METEO_SOURCE_VERSION", "era5-land-timeseries-v1")
POLL_SECONDS = max(300, int(os.getenv("CHAMAN_METEO_POLL_SECONDS", "21600")))
BACKFILL_DAYS_PER_RUN = max(
    1, min(366, int(os.getenv("CHAMAN_METEO_BACKFILL_DAYS_PER_RUN", "31")))
)
HTTP_TIMEOUT_SECONDS = max(
    5, min(300, int(os.getenv("CHAMAN_METEO_HTTP_TIMEOUT_SECONDS", "60")))
)
RUN_ONCE = env_bool("CHAMAN_METEO_RUN_ONCE")
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
