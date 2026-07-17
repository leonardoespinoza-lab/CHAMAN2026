import os

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_QUEUE = os.getenv("REDIS_NDVI_QUEUE", os.getenv("REDIS_QUEUE", "tareas-ndvi"))
REDIS_DB = int(os.getenv("REDIS_NDVI_DB", os.getenv("REDIS_DB", "0")))
NDVI_QUEUE_MAX_ATTEMPTS = max(
    1, int(os.getenv("NDVI_QUEUE_MAX_ATTEMPTS", "4"))
)
NDVI_QUEUE_RETRY_BASE_SECONDS = max(
    0.0, float(os.getenv("NDVI_QUEUE_RETRY_BASE_SECONDS", "15"))
)
NDVI_QUEUE_RETRY_MAX_SECONDS = max(
    NDVI_QUEUE_RETRY_BASE_SECONDS,
    float(os.getenv("NDVI_QUEUE_RETRY_MAX_SECONDS", "300")),
)
NDVI_QUEUE_VISIBILITY_TIMEOUT_SECONDS = max(
    5, int(os.getenv("NDVI_QUEUE_VISIBILITY_TIMEOUT_SECONDS", "1800"))
)
NDVI_QUEUE_POLL_SECONDS = max(
    0.05, float(os.getenv("NDVI_QUEUE_POLL_SECONDS", "1"))
)
NDVI_QUEUE_COMPLETED_TTL_SECONDS = max(
    60, int(os.getenv("NDVI_QUEUE_COMPLETED_TTL_SECONDS", "604800"))
)

DOWNLOAD_FOLDER = os.getenv("DOWNLOAD_FOLDER", "./.downloads")

# Almacenamiento local (montado como hostPath compartido con nginx)
LOCAL_NDVI_PATH = os.getenv("LOCAL_NDVI_PATH", "/app/ndvi-output")
#
SAT_COLLECTIONS = ["landsat-c2-l2", "sentinel-2-l2a"]
# SAT_COLLECTIONS = ["sentinel-2-l2a"]
#
SAT_DELTA_VENCIMIENTO = int(os.getenv("SAT_DELTA_VENCIMIENTO", "30"))
SAT_SENTINEL_PREFERENCE_DAYS = int(os.getenv("SAT_SENTINEL_PREFERENCE_DAYS", "6"))
SAT_CLOUD_COVER_THRESHOLDS = [
    int(value.strip())
    for value in os.getenv("SAT_CLOUD_COVER_THRESHOLDS", "30,50,70").split(",")
    if value.strip().isdigit()
]

API_EXTERNA_URL = os.getenv("API_EXTERNA_URL", "http://localhost:5002")
NDVI_WORKER_TOKEN = os.getenv("NDVI_WORKER_TOKEN", "")

#
PORT = int(os.getenv("PORT", "5000"))
ENV = os.getenv("ENV", "test")
#
ENVIAR_BACKEND = os.getenv("ENVIAR_BACKEND", "false")
CLEAN_UP = os.getenv("CLEAN_UP", "false")


#     "daymet-annual-pr",
#     "daymet-daily-hi",
#     "3dep-seamless",
#     "3dep-lidar-dsm",
#     "fia",
#     "sentinel-1-rtc",
#     "gridmet",
#     "daymet-annual-na",
#     "daymet-monthly-na",
#     "daymet-annual-hi",
#     "daymet-monthly-hi",
#     "daymet-monthly-pr",
#     "gnatsgo-tables",
#     "hgb",
#     "cop-dem-glo-30",
#     "cop-dem-glo-90",
#     "terraclimate",
#     "nasa-nex-gddp-cmip6",
#     "gpm-imerg-hhr",
#     "gnatsgo-rasters",
#     "3dep-lidar-hag",
#     "io-lulc-annual-v02",
#     "goes-cmi",
#     "conus404",
#     "3dep-lidar-intensity",
#     "3dep-lidar-pointsourceid",
#     "mtbs",
#     "noaa-c-cap",
#     "3dep-lidar-copc",
#     "modis-64A1-061",
#     "alos-fnf-mosaic",
#     "3dep-lidar-returns",
#     "mobi",
#     "landsat-c2-l2",
#     "era5-pds",
#     "chloris-biomass",
#     "kaza-hydroforecast",
#     "planet-nicfi-analytic",
#     "modis-17A2H-061",
#     "modis-11A2-061",
#     "daymet-daily-pr",
#     "3dep-lidar-dtm-native",
#     "3dep-lidar-classification",
#     "3dep-lidar-dtm",
#     "gap",
#     "modis-17A2HGF-061",
#     "planet-nicfi-visual",
#     "gbif",
#     "modis-17A3HGF-061",
#     "modis-09A1-061",
#     "alos-dem",
#     "alos-palsar-mosaic",
#     "deltares-water-availability",
#     "modis-16A3GF-061",
#     "modis-21A2-061",
#     "us-census",
#     "jrc-gsw",
#     "deltares-floods",
#     "modis-43A4-061",
#     "modis-09Q1-061",
#     "modis-14A1-061",
#     "hrea",
#     "modis-13Q1-061",
#     "modis-14A2-061",
#     "sentinel-2-l2a",
#     "modis-15A2H-061",
#     "modis-11A1-061",
#     "modis-15A3H-061",
#     "modis-13A1-061",
#     "daymet-daily-na",
#     "nrcan-landcover",
#     "modis-10A2-061",
#     "ecmwf-forecast",
#     "noaa-mrms-qpe-24h-pass2",
#     "sentinel-1-grd",
#     "nasadem",
#     "io-lulc",
#     "landsat-c2-l1",
#     "drcog-lulc",
#     "chesapeake-lc-7",
#     "chesapeake-lc-13",
#     "chesapeake-lu",
#     "noaa-mrms-qpe-1h-pass1",
#     "noaa-mrms-qpe-1h-pass2",
#     "noaa-nclimgrid-monthly",
#     "usda-cdl",
#     "eclipse",
#     "esa-cci-lc",
#     "esa-cci-lc-netcdf",
#     "fws-nwi",
#     "usgs-lcmap-conus-v13",
#     "usgs-lcmap-hawaii-v10",
#     "noaa-climate-normals-tabular",
#     "noaa-climate-normals-netcdf",
#     "goes-glm",
#     "noaa-climate-normals-gridded",
#     "aster-l1t",
#     "cil-gdpcir-cc-by-sa",
#     "naip",
#     "io-lulc-9-class",
#     "io-biodiversity",
#     "noaa-cdr-sea-surface-temperature-whoi",
#     "noaa-cdr-ocean-heat-content",
#     "cil-gdpcir-cc0",
#     "cil-gdpcir-cc-by",
#     "noaa-cdr-sea-surface-temperature-whoi-netcdf",
#     "noaa-cdr-sea-surface-temperature-optimum-interpolation",
#     "modis-10A1-061",
#     "sentinel-5p-l2-netcdf",
#     "sentinel-3-olci-wfr-l2-netcdf",
#     "noaa-cdr-ocean-heat-content-netcdf",
#     "hls2-l30",
#     "sentinel-3-synergy-aod-l2-netcdf",
#     "sentinel-3-synergy-v10-l2-netcdf",
#     "sentinel-3-olci-lfr-l2-netcdf",
#     "sentinel-3-sral-lan-l2-netcdf",
#     "sentinel-3-slstr-lst-l2-netcdf",
#     "sentinel-3-slstr-wst-l2-netcdf",
#     "sentinel-3-sral-wat-l2-netcdf",
#     "hls2-s30",
#     "ms-buildings",
#     "sentinel-3-slstr-frp-l2-netcdf",
#     "sentinel-3-synergy-syn-l2-netcdf",
#     "sentinel-3-synergy-vgp-l2-netcdf",
#     "sentinel-3-synergy-vg1-l2-netcdf",
#     "esa-worldcover",
