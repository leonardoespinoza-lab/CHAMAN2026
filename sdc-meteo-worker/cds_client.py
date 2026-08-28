import csv
import json
import math
import re
import shutil
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import cdsapi


VARIABLE_GROUPS = [
    ["2m_dewpoint_temperature", "2m_temperature"],
    ["surface_pressure", "total_precipitation"],
    ["surface_solar_radiation_downwards", "surface_thermal_radiation_downwards"],
    ["skin_temperature"],
    ["snow_cover", "snow_depth"],
    [
        "soil_temperature_level_1",
        "soil_temperature_level_2",
        "soil_temperature_level_3",
        "soil_temperature_level_4",
    ],
    [
        "volumetric_soil_water_level_1",
        "volumetric_soil_water_level_2",
        "volumetric_soil_water_level_3",
        "volumetric_soil_water_level_4",
    ],
    ["10m_u_component_of_wind", "10m_v_component_of_wind"],
]

ALIASES = {
    "temperatureK": ["2m_temperature", "t2m"],
    "dewPointK": ["2m_dewpoint_temperature", "d2m"],
    "surfacePressurePa": ["surface_pressure", "sp"],
    "precipitationM": ["total_precipitation", "tp"],
    "shortwaveRadiationJm2": ["surface_solar_radiation_downwards", "ssrd"],
    "thermalRadiationJm2": ["surface_thermal_radiation_downwards", "strd"],
    "windU10Ms": ["10m_u_component_of_wind", "u10"],
    "windV10Ms": ["10m_v_component_of_wind", "v10"],
    "soilTemperatureK1": ["soil_temperature_level_1", "stl1"],
    "soilTemperatureK2": ["soil_temperature_level_2", "stl2"],
    "soilTemperatureK3": ["soil_temperature_level_3", "stl3"],
    "soilTemperatureK4": ["soil_temperature_level_4", "stl4"],
    "soilWaterM3M31": [
        "volumetric_soil_water_level_1",
        "volumetric_soil_water_layer_1",
        "swvl1",
    ],
    "soilWaterM3M32": [
        "volumetric_soil_water_level_2",
        "volumetric_soil_water_layer_2",
        "swvl2",
    ],
    "soilWaterM3M33": [
        "volumetric_soil_water_level_3",
        "volumetric_soil_water_layer_3",
        "swvl3",
    ],
    "soilWaterM3M34": [
        "volumetric_soil_water_level_4",
        "volumetric_soil_water_layer_4",
        "swvl4",
    ],
    "skinTemperatureK": ["skin_temperature", "skt"],
    "snowCoverFraction": ["snow_cover", "snowc"],
    "snowDepthM": ["snow_depth"],
}

TIME_ALIASES = ["valid_time", "time", "datetime", "date"]


class CdsTimeSeriesClient:
    def __init__(self, url: str, key: str, download_dir: str):
        self.client = cdsapi.Client(url=url, key=key, quiet=True, progress=False)
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)

    def retrieve(
        self,
        grid_key: str,
        latitude: float,
        longitude: float,
        start: str,
        end: str,
        source_version: str,
    ) -> list[dict]:
        safe_key = re.sub(r"[^A-Za-z0-9_-]", "-", grid_key)
        work_dir = self.download_dir / f"{safe_key}-{start}-{end}"
        if work_dir.exists():
            shutil.rmtree(work_dir)
        work_dir.mkdir(parents=True)
        merged = defaultdict(dict)
        try:
            for index, variables in enumerate(VARIABLE_GROUPS):
                target = work_dir / f"group-{index}.download"
                request = {
                    "variable": variables,
                    "location": {
                        "latitude": round(float(latitude), 4),
                        "longitude": round(float(longitude), 4),
                    },
                    "date": f"{start}/{end}",
                    "data_format": "csv",
                }
                self.client.retrieve(
                    "reanalysis-era5-land-timeseries", request, str(target)
                )
                for csv_path in self._csv_files(target, work_dir / f"group-{index}"):
                    self._merge_csv(csv_path, merged)
            imported_at = datetime.now(timezone.utc).isoformat()
            return [
                {
                    "gridPointKey": grid_key,
                    "timestamp": timestamp,
                    "provider": "copernicus-cds",
                    "dataset": "reanalysis-era5-land-timeseries",
                    "sourceVersion": source_version,
                    "values": self._assemble_values(values),
                    "qualityFlags": [],
                    "importedAt": imported_at,
                }
                for timestamp, values in sorted(merged.items())
                if values
            ]
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    def _csv_files(self, target: Path, extract_dir: Path) -> list[Path]:
        if zipfile.is_zipfile(target):
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(target) as archive:
                archive.extractall(extract_dir)
            return list(extract_dir.rglob("*.csv"))
        return [target]

    def _merge_csv(self, path: Path, merged: dict):
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            headers = {self._normalise(name): name for name in (reader.fieldnames or [])}
            time_header = self._find_header(headers, TIME_ALIASES)
            if not time_header:
                raise RuntimeError(f"CSV CDS sin columna temporal reconocible: {path.name}")
            mapped = {
                target: self._find_header(headers, aliases)
                for target, aliases in ALIASES.items()
            }
            for row in reader:
                timestamp = self._timestamp(row.get(time_header))
                if not timestamp:
                    continue
                for target, header in mapped.items():
                    if not header:
                        continue
                    value = self._number(row.get(header))
                    if value is not None:
                        merged[timestamp][target] = value

    def _find_header(self, headers: dict, aliases: list[str]):
        for alias in aliases:
            if alias in headers:
                return headers[alias]
        for normalised, original in headers.items():
            if any(alias in normalised for alias in aliases):
                return original
        return None

    def _normalise(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")

    def _timestamp(self, value):
        text = str(value or "").strip()
        if not text:
            return None
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    def _number(self, value):
        try:
            number = float(value)
            return number if math.isfinite(number) else None
        except (TypeError, ValueError):
            return None

    def _assemble_values(self, values: dict) -> dict:
        output = {
            key: value
            for key, value in values.items()
            if not key.startswith("soilTemperatureK")
            and not key.startswith("soilWaterM3M3")
        }
        soil_temperature = [values.get(f"soilTemperatureK{i}") for i in range(1, 5)]
        soil_water = [values.get(f"soilWaterM3M3{i}") for i in range(1, 5)]
        if any(value is not None for value in soil_temperature):
            output["soilTemperatureK"] = soil_temperature
        if any(value is not None for value in soil_water):
            output["soilWaterM3M3"] = soil_water
        return output
