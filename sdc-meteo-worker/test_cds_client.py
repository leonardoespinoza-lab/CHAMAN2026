import csv
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.modules.setdefault("cdsapi", types.SimpleNamespace(Client=object))

from cds_client import CdsTimeSeriesClient


class FakeCdsClient:
    def retrieve(self, _dataset: str, request: dict, target: str):
        variables = request["variable"]
        rows = {
            "2m_temperature": 293.15,
            "2m_dewpoint_temperature": 283.15,
            "surface_pressure": 100000.0,
            "total_precipitation": 0.001,
            "surface_solar_radiation_downwards": 1000000.0,
            "surface_thermal_radiation_downwards": 1200000.0,
            "soil_temperature_level_1": 291.15,
            "soil_temperature_level_2": 290.15,
            "soil_temperature_level_3": 289.15,
            "soil_temperature_level_4": 288.15,
            "volumetric_soil_water_level_1": 0.31,
            "volumetric_soil_water_level_2": 0.32,
            "volumetric_soil_water_level_3": 0.33,
            "volumetric_soil_water_level_4": 0.34,
            "10m_u_component_of_wind": 3.0,
            "10m_v_component_of_wind": 4.0,
        }
        with Path(target).open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["valid_time", *variables])
            writer.writeheader()
            writer.writerow(
                {
                    "valid_time": "2026-08-20T12:00:00",
                    **{variable: rows[variable] for variable in variables},
                }
            )


class CdsTimeSeriesClientTest(unittest.TestCase):
    def test_retrieve_merges_official_xarray_style_csv_groups(self):
        with tempfile.TemporaryDirectory() as directory:
            client = CdsTimeSeriesClient.__new__(CdsTimeSeriesClient)
            client.client = FakeCdsClient()
            client.download_dir = Path(directory)

            records = client.retrieve(
                "ar-neuquen-pilot",
                -38.95,
                -68.06,
                "2026-08-20",
                "2026-08-20",
                "era5-land-timeseries-v1",
            )

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["timestamp"], "2026-08-20T12:00:00Z")
        self.assertEqual(record["values"]["temperatureK"], 293.15)
        self.assertEqual(record["values"]["dewPointK"], 283.15)
        self.assertEqual(record["values"]["windU10Ms"], 3.0)
        self.assertEqual(record["values"]["windV10Ms"], 4.0)
        self.assertEqual(record["values"]["soilTemperatureK"], [291.15, 290.15, 289.15, 288.15])
        self.assertEqual(record["values"]["soilWaterM3M3"], [0.31, 0.32, 0.33, 0.34])


if __name__ == "__main__":
    unittest.main()
