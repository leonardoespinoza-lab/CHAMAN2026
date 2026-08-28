import csv
import math
import sys
import tempfile
import types
import unittest
from collections import defaultdict
from pathlib import Path

sys.modules.setdefault("cdsapi", types.SimpleNamespace(Client=object))

from cds_client import CdsTimeSeriesClient, VARIABLE_GROUPS


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
            "skin_temperature": 294.15,
            "snow_cover": 0.0,
            "snow_depth": 0.0,
        }
        csv_headers = {
            "snow_cover": "snowc",
            "snow_depth": "sde",
        }
        with Path(target).open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(
                stream,
                fieldnames=[
                    "valid_time",
                    *[csv_headers.get(variable, variable) for variable in variables],
                ],
            )
            writer.writeheader()
            writer.writerow(
                {
                    "valid_time": "2026-08-20T12:00:00",
                    **{
                        csv_headers.get(variable, variable): rows[variable]
                        for variable in variables
                    },
                }
            )


class CdsTimeSeriesClientTest(unittest.TestCase):
    def test_requests_all_19_official_era5_land_variables(self):
        variables = [variable for group in VARIABLE_GROUPS for variable in group]
        self.assertEqual(len(variables), 19)
        self.assertEqual(len(set(variables)), 19)
        self.assertEqual(
            VARIABLE_GROUPS,
            [
                ["2m_dewpoint_temperature", "2m_temperature"],
                ["surface_pressure", "total_precipitation"],
                [
                    "surface_solar_radiation_downwards",
                    "surface_thermal_radiation_downwards",
                ],
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
            ],
        )

    def test_non_finite_csv_numbers_are_rejected(self):
        client = CdsTimeSeriesClient.__new__(CdsTimeSeriesClient)
        self.assertIsNone(client._number("inf"))
        self.assertIsNone(client._number("-inf"))
        self.assertIsNone(client._number(math.nan))
        self.assertEqual(client._number("0"), 0.0)

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
        self.assertEqual(record["values"]["skinTemperatureK"], 294.15)
        self.assertEqual(record["values"]["snowCoverFraction"], 0.0)
        self.assertEqual(record["values"]["snowDepthM"], 0.0)

    def test_reads_legacy_layer_aliases_without_changing_raw_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.csv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(
                    stream,
                    fieldnames=[
                        "valid_time",
                        "volumetric_soil_water_layer_1",
                        "snow_cover",
                    ],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "valid_time": "2026-08-20T12:00:00Z",
                        "volumetric_soil_water_layer_1": 0.0,
                        "snow_cover": 0.0,
                    }
                )
            merged = defaultdict(dict)
            client = CdsTimeSeriesClient.__new__(CdsTimeSeriesClient)
            client._merge_csv(path, merged)

        values = client._assemble_values(merged["2026-08-20T12:00:00Z"])
        self.assertEqual(values["soilWaterM3M3"], [0.0, None, None, None])
        self.assertEqual(values["snowCoverFraction"], 0.0)

    def test_ambiguous_sd_column_is_not_accepted_as_physical_snow_depth(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ambiguous.csv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=["valid_time", "sd"])
                writer.writeheader()
                writer.writerow(
                    {"valid_time": "2026-08-20T12:00:00Z", "sd": 0.25}
                )
            merged = defaultdict(dict)
            client = CdsTimeSeriesClient.__new__(CdsTimeSeriesClient)
            client._merge_csv(path, merged)

        values = client._assemble_values(merged["2026-08-20T12:00:00Z"])
        self.assertNotIn("snowDepthM", values)

    def test_official_sde_column_is_accepted_as_physical_snow_depth(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "official.csv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=["valid_time", "sde"])
                writer.writeheader()
                writer.writerow(
                    {"valid_time": "2026-08-20T12:00:00Z", "sde": 0.125}
                )
            merged = defaultdict(dict)
            client = CdsTimeSeriesClient.__new__(CdsTimeSeriesClient)
            client._merge_csv(path, merged)

        values = client._assemble_values(merged["2026-08-20T12:00:00Z"])
        self.assertEqual(values["snowDepthM"], 0.125)

    def test_official_sde_zero_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "official-zero.csv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=["valid_time", "sde"])
                writer.writeheader()
                writer.writerow(
                    {"valid_time": "2026-08-20T12:00:00Z", "sde": 0.0}
                )
            merged = defaultdict(dict)
            client = CdsTimeSeriesClient.__new__(CdsTimeSeriesClient)
            client._merge_csv(path, merged)

        values = client._assemble_values(merged["2026-08-20T12:00:00Z"])
        self.assertEqual(values["snowDepthM"], 0.0)

    def test_empty_official_sde_value_remains_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "official-empty.csv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=["valid_time", "sde"])
                writer.writeheader()
                writer.writerow(
                    {"valid_time": "2026-08-20T12:00:00Z", "sde": ""}
                )
            merged = defaultdict(dict)
            client = CdsTimeSeriesClient.__new__(CdsTimeSeriesClient)
            client._merge_csv(path, merged)

        values = client._assemble_values(merged["2026-08-20T12:00:00Z"])
        self.assertNotIn("snowDepthM", values)

    def test_snow_water_equivalent_column_is_not_accepted_as_physical_depth(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "water-equivalent.csv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(
                    stream,
                    fieldnames=["valid_time", "snow_depth_water_equivalent"],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "valid_time": "2026-08-20T12:00:00Z",
                        "snow_depth_water_equivalent": 0.25,
                    }
                )
            merged = defaultdict(dict)
            client = CdsTimeSeriesClient.__new__(CdsTimeSeriesClient)
            client._merge_csv(path, merged)

        values = client._assemble_values(merged["2026-08-20T12:00:00Z"])
        self.assertNotIn("snowDepthM", values)


if __name__ == "__main__":
    unittest.main()
