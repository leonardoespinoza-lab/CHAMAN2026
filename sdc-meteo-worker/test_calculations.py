import unittest
import math
from datetime import datetime, timedelta, timezone

from calculations import (
    aggregate_daily,
    daily_utc_window,
    derive_hourly,
    expected_hours_for_local_date,
    hourly_et0,
    relative_humidity_pct,
    wind_from_components,
)


class ChamanMeteoCalculationsTest(unittest.TestCase):
    def test_relative_humidity_uses_temperature_and_dewpoint(self):
        self.assertAlmostEqual(relative_humidity_pct(20.0, 10.0), 52.5, delta=0.3)
        self.assertEqual(relative_humidity_pct(10.0, 12.0), 100.0)

    def test_wind_vector_returns_speed_and_meteorological_direction(self):
        speed, direction = wind_from_components(0.0, -5.0)
        self.assertAlmostEqual(speed, 5.0, places=6)
        self.assertAlmostEqual(direction, 0.0, places=6)

    def test_hourly_et0_matches_fao56_example_19(self):
        # FAO-56, Chapter 4, Example 19 (14:00-15:00): T=38 C,
        # ea=3.445 kPa, u2=3.3 m/s, Rn=1.749 MJ/m2/h and
        # gamma=0.0673 kPa/C produce ET0=0.63 mm/h.
        actual_vapour_pressure_kpa = 3.445
        logarithm = math.log(actual_vapour_pressure_kpa / 0.6108)
        dew_point_c = 237.3 * logarithm / (17.27 - logarithm)
        pressure_kpa = 0.0673 / 0.000665
        self.assertAlmostEqual(
            hourly_et0(38.0, dew_point_c, pressure_kpa, 3.3, 1.749),
            0.63,
            delta=0.01,
        )

    def test_era5_radiation_is_always_converted_from_joules_to_megajoules(self):
        for joules, expected in ((0.0, 0.0), (50.0, 0.00005), (100.0, 0.0001)):
            hourly = derive_hourly(
                {
                    "gridPointKey": "test-grid",
                    "timestamp": "2026-08-20T12:00:00Z",
                    "values": {
                        "shortwaveRadiationJm2": joules,
                        "thermalRadiationJm2": joules,
                    },
                },
                "test-v2",
            )
            self.assertEqual(hourly["values"]["shortwaveRadiationMjM2"], expected)
            self.assertEqual(hourly["values"]["thermalRadiationMjM2"], expected)

    def test_raw_zeroes_are_preserved_with_fixed_era5_units(self):
        hourly = derive_hourly(
            {
                "gridPointKey": "test-grid",
                "timestamp": "2026-08-20T12:00:00Z",
                "values": {
                    "precipitationM": 0.0,
                    "shortwaveRadiationJm2": 0.0,
                    "thermalRadiationJm2": 0.0,
                },
            },
            "test-v2",
        )
        self.assertEqual(hourly["values"]["precipitationMm"], 0.0)
        self.assertEqual(hourly["values"]["shortwaveRadiationMjM2"], 0.0)
        self.assertEqual(hourly["values"]["thermalRadiationMjM2"], 0.0)

    def test_extreme_precipitation_and_invalid_pressure_are_quarantined(self):
        hourly = derive_hourly(
            {
                "gridPointKey": "test-grid",
                "timestamp": "2026-08-20T12:00:00Z",
                "values": {
                    "precipitationM": 2.0,
                    "surfacePressurePa": 100.0,
                },
            },
            "test-v2",
        )
        self.assertNotIn("precipitationMm", hourly["values"])
        self.assertNotIn("surfacePressureKpa", hourly["values"])
        self.assertIn(
            "precipitation_above_physical_limit_quarantined",
            hourly["qualityFlags"],
        )
        self.assertIn(
            "surface_pressure_outside_valid_range_omitted",
            hourly["qualityFlags"],
        )

    def test_pressure_and_precipitation_use_declared_raw_units_not_magnitude(self):
        hourly = derive_hourly(
            {
                "gridPointKey": "test-grid",
                "timestamp": "2026-08-20T12:00:00Z",
                "values": {
                    "precipitationM": 0.5,
                    "surfacePressurePa": 50_000.0,
                },
            },
            "test-v2",
        )
        self.assertEqual(hourly["values"]["precipitationMm"], 500.0)
        self.assertEqual(hourly["values"]["surfacePressureKpa"], 50.0)

    def test_non_finite_wind_and_invalid_soil_water_are_omitted_but_zero_survives(self):
        hourly = derive_hourly(
            {
                "gridPointKey": "test-grid",
                "timestamp": "2026-08-20T12:00:00Z",
                "values": {
                    "windU10Ms": math.inf,
                    "windV10Ms": 0.0,
                    "soilWaterM3M3": [0.0, 0.5, 1.01, math.nan],
                },
            },
            "test-v2",
        )
        self.assertNotIn("windSpeed10Ms", hourly["values"])
        self.assertEqual(
            hourly["values"]["soilWaterM3M3"], [0.0, 0.5, None, None]
        )
        self.assertIn(
            "wind_components_invalid_or_outside_range_omitted",
            hourly["qualityFlags"],
        )
        self.assertIn(
            "soil_water_layer_3_outside_valid_range_omitted",
            hourly["qualityFlags"],
        )

    def test_derivation_and_daily_aggregation_keep_humidity(self):
        raw = {
            "gridPointKey": "test-grid",
            "timestamp": "2026-08-20T12:00:00Z",
            "values": {
                "temperatureK": 293.15,
                "dewPointK": 283.15,
                "surfacePressurePa": 101325.0,
                "windU10Ms": 1.0,
                "windV10Ms": 2.0,
                "precipitationM": 0.001,
                "shortwaveRadiationJm2": 1_000_000.0,
                "thermalRadiationJm2": 1_200_000.0,
                "skinTemperatureK": 294.15,
                "snowCoverFraction": 0.0,
                "snowDepthM": 0.0,
                "soilTemperatureK": [291.15, 290.15, 289.15, 288.15],
                "soilWaterM3M3": [0.0, 0.2, 0.3, 0.4],
            },
        }
        hourly = derive_hourly(raw, "test-v1")
        self.assertAlmostEqual(hourly["values"]["temperatureC"], 20.0, places=6)
        self.assertAlmostEqual(
            hourly["values"]["relativeHumidityPct"], 52.5, delta=0.3
        )
        self.assertAlmostEqual(hourly["values"]["precipitationMm"], 1.0)
        self.assertAlmostEqual(hourly["values"]["skinTemperatureC"], 21.0)
        self.assertEqual(hourly["values"]["snowCoverPct"], 0.0)
        self.assertEqual(hourly["values"]["snowDepthM"], 0.0)
        self.assertEqual(hourly["values"]["soilWaterM3M3"][0], 0.0)
        daily = aggregate_daily([hourly], "America/Argentina/Buenos_Aires", "test-v1")
        self.assertEqual(len(daily), 1)
        self.assertAlmostEqual(
            daily[0]["values"]["relativeHumidityMeanPct"], 52.5, delta=0.3
        )
        self.assertEqual(daily[0]["hoursExpected"], 24)
        self.assertEqual(daily[0]["values"]["snowCoverMeanPct"], 0.0)
        self.assertEqual(daily[0]["availableHoursByMetric"]["snowCover"], 1)
        self.assertIn(
            "daily_incomplete_less_than_expected_hours",
            daily[0]["qualityFlags"],
        )

    def test_net_radiation_uses_skin_temperature_for_outgoing_longwave(self):
        def derive(skin_temperature_k):
            return derive_hourly(
                {
                    "gridPointKey": "test-grid",
                    "timestamp": "2026-08-20T12:00:00Z",
                    "values": {
                        "temperatureK": 293.15,
                        "dewPointK": 283.15,
                        "surfacePressurePa": 101_325.0,
                        "windU10Ms": 1.0,
                        "windV10Ms": 2.0,
                        "shortwaveRadiationJm2": 1_000_000.0,
                        "thermalRadiationJm2": 1_200_000.0,
                        "skinTemperatureK": skin_temperature_k,
                    },
                },
                "test-v2",
            )

        cool_surface = derive(293.15)
        hot_surface = derive(313.15)
        expected_outgoing = (
            5.670374419e-8 * (293.15**4) * 3600 / 1_000_000
        )
        expected_net = 0.77 * 1.0 + 1.2 - expected_outgoing
        self.assertAlmostEqual(
            cool_surface["values"]["netRadiationMjM2"], expected_net, places=9
        )
        self.assertLess(
            hot_surface["values"]["netRadiationMjM2"],
            cool_surface["values"]["netRadiationMjM2"],
        )
        self.assertNotIn(
            "net_radiation_skin_temperature_unavailable_air_fallback",
            cool_surface["qualityFlags"],
        )

    def test_snow_cover_outside_fraction_range_is_flagged_and_omitted(self):
        hourly = derive_hourly(
            {
                "gridPointKey": "test-grid",
                "timestamp": "2026-08-20T12:00:00Z",
                "values": {"snowCoverFraction": 1.01, "snowDepthM": -0.01},
            },
            "test-v1",
        )
        self.assertNotIn("snowCoverPct", hourly["values"])
        self.assertNotIn("snowDepthM", hourly["values"])
        self.assertIn(
            "snow_cover_outside_valid_range_omitted", hourly["qualityFlags"]
        )
        self.assertIn("snow_depth_negative_omitted", hourly["qualityFlags"])

    def test_daily_aggregation_exposes_complete_historical_metric_contract(self):
        rows = []
        start = datetime(2026, 8, 20, 3, tzinfo=timezone.utc)
        # 24 instantaneous samples (local 00:00..23:00) plus the following
        # local-midnight boundary that owns the last accumulated interval.
        for index in range(25):
            rows.append(
                {
                    "gridPointKey": "test-grid",
                    "timestamp": (start + timedelta(hours=index))
                    .isoformat()
                    .replace("+00:00", "Z"),
                    "values": {
                        "temperatureC": 10.0 + index,
                        "dewPointC": 5.0 + index,
                        "relativeHumidityPct": 40.0 + index,
                        "surfacePressureKpa": 100.0 + index / 10.0,
                        "windU10Ms": 0.0,
                        "windV10Ms": -4.0,
                        "windSpeed10Ms": 4.0,
                        "windSpeed2Ms": 3.0,
                        "windDirectionDeg": 0.0,
                        "precipitationMm": 0.0,
                        "shortwaveRadiationMjM2": 1.0,
                        "thermalRadiationMjM2": 2.0,
                        "netRadiationMjM2": 0.5,
                        "vpdKpa": 0.5 + index / 100.0,
                        "et0Mm": 0.1,
                        "skinTemperatureC": 11.0 + index,
                        "snowCoverPct": 0.0,
                        "snowDepthM": 0.0,
                        "soilTemperatureC": [
                            10.0 + index,
                            11.0 + index,
                            12.0 + index,
                            13.0 + index,
                        ],
                        "soilWaterM3M3": [0.1, 0.2, 0.3, 0.4],
                    },
                    "qualityFlags": [],
                }
            )

        daily = aggregate_daily(
            rows, "America/Argentina/Buenos_Aires", "test-v1"
        )[0]
        values = daily["values"]
        self.assertEqual(values["dewPointMinC"], 5.0)
        self.assertEqual(values["dewPointMeanC"], 16.5)
        self.assertEqual(values["dewPointMaxC"], 28.0)
        self.assertEqual(values["surfacePressureMinKpa"], 100.0)
        self.assertAlmostEqual(values["surfacePressureMeanKpa"], 101.15)
        self.assertEqual(values["surfacePressureMaxKpa"], 102.3)
        self.assertEqual(values["windSpeed2mMeanMs"], 3.0)
        self.assertEqual(values["windSpeed2mMaxMs"], 3.0)
        self.assertEqual(values["windSpeed10mMeanMs"], 4.0)
        self.assertEqual(values["windSpeed10mMaxMs"], 4.0)
        self.assertEqual(values["windSpeedMeanMs"], values["windSpeed2mMeanMs"])
        self.assertEqual(values["windSpeedMaxMs"], values["windSpeed2mMaxMs"])
        self.assertAlmostEqual(values["windDirectionDominantDeg"], 0.0)
        self.assertAlmostEqual(values["windDirectionResultantRatio"], 1.0)
        self.assertEqual(values["shortwaveRadiationMjM2"], 24.0)
        self.assertEqual(values["thermalRadiationMjM2"], 48.0)
        self.assertEqual(values["netRadiationMjM2"], 12.0)
        self.assertEqual(values["vpdMinKpa"], 0.5)
        self.assertAlmostEqual(values["vpdMeanKpa"], 0.615)
        self.assertEqual(values["vpdMaxKpa"], 0.73)
        self.assertEqual(values["skinTemperatureMinC"], 11.0)
        self.assertEqual(values["skinTemperatureMeanC"], 22.5)
        self.assertEqual(values["skinTemperatureMaxC"], 34.0)
        self.assertEqual(values["snowCoverMinPct"], 0.0)
        self.assertEqual(values["snowCoverMeanPct"], 0.0)
        self.assertEqual(values["snowCoverMaxPct"], 0.0)
        self.assertEqual(values["snowDepthMinM"], 0.0)
        self.assertEqual(values["soilTemperatureMinC"], [10.0, 11.0, 12.0, 13.0])
        self.assertEqual(values["soilTemperatureMeanC"], [21.5, 22.5, 23.5, 24.5])
        self.assertEqual(values["soilTemperatureMaxC"], [33.0, 34.0, 35.0, 36.0])
        self.assertEqual(values["soilWaterMinM3M3"], [0.1, 0.2, 0.3, 0.4])
        for actual, expected in zip(
            values["soilWaterMeanM3M3"], [0.1, 0.2, 0.3, 0.4]
        ):
            self.assertAlmostEqual(actual, expected)
        self.assertEqual(values["soilWaterMaxM3M3"], [0.1, 0.2, 0.3, 0.4])
        self.assertEqual(daily["availableHoursByMetric"]["wind10m"], 24)
        self.assertEqual(
            daily["availableHoursByMetric"]["soilTemperature"], [24, 24, 24, 24]
        )
        self.assertNotIn(
            "daily_incomplete_less_than_expected_hours", daily["qualityFlags"]
        )

    def test_daily_accumulations_use_interval_end_timestamp(self):
        start = datetime(2026, 8, 20, 3, tzinfo=timezone.utc)
        rows = []
        for index in range(25):
            rows.append(
                {
                    "gridPointKey": "test-grid",
                    "timestamp": (start + timedelta(hours=index))
                    .isoformat()
                    .replace("+00:00", "Z"),
                    "values": {
                        "temperatureC": 999.0 if index == 24 else float(index),
                        # The value at local 00:00 belongs to the preceding day.
                        "precipitationMm": 100.0 if index == 0 else 1.0,
                        "shortwaveRadiationMjM2": 100.0 if index == 0 else 1.0,
                        "thermalRadiationMjM2": 100.0 if index == 0 else 2.0,
                        "netRadiationMjM2": 100.0 if index == 0 else 0.5,
                        "et0Mm": 100.0 if index == 0 else 0.1,
                    },
                    "qualityFlags": [],
                }
            )

        daily = aggregate_daily(
            rows, "America/Argentina/Buenos_Aires", "test-v2"
        )
        self.assertEqual([row["date"] for row in daily], ["2026-08-20"])
        values = daily[0]["values"]
        self.assertEqual(values["temperatureMaxC"], 23.0)
        self.assertEqual(values["precipitationMm"], 24.0)
        self.assertEqual(values["precipitationMaxHourlyMm"], 1.0)
        self.assertEqual(values["shortwaveRadiationMjM2"], 24.0)
        self.assertEqual(values["thermalRadiationMjM2"], 48.0)
        self.assertEqual(values["netRadiationMjM2"], 12.0)
        self.assertAlmostEqual(values["et0Mm"], 2.4)
        self.assertEqual(daily[0]["availableHoursByMetric"]["precipitation"], 24)

    def test_daily_interval_ownership_respects_chile_spring_forward(self):
        # On 2026-09-06 Santiago has no representable local 00:00; the first
        # instant is 01:00 (04Z) and the civil day contains 23 intervals.
        start = datetime(2026, 9, 6, 4, tzinfo=timezone.utc)
        rows = [
            {
                "gridPointKey": "test-grid",
                "timestamp": (start + timedelta(hours=index))
                .isoformat()
                .replace("+00:00", "Z"),
                "values": {
                    "temperatureC": 10.0,
                    "precipitationMm": 100.0 if index == 0 else 1.0,
                },
                "qualityFlags": [],
            }
            for index in range(24)
        ]
        daily = aggregate_daily(rows, "America/Santiago", "test-v2")
        self.assertEqual([row["date"] for row in daily], ["2026-09-06"])
        self.assertEqual(daily[0]["hoursAvailable"], 23)
        self.assertEqual(daily[0]["hoursExpected"], 23)
        self.assertEqual(daily[0]["values"]["precipitationMm"], 23.0)
        self.assertEqual(
            daily[0]["values"]["precipitationMaxHourlyMm"], 1.0
        )
        self.assertEqual(
            daily[0]["availableHoursByMetric"]["precipitation"], 23
        )

    def test_daily_wind_direction_uses_vectors_and_reports_cancellation(self):
        start = datetime(2026, 8, 20, 3, tzinfo=timezone.utc)
        rows = [
            {
                "gridPointKey": "test-grid",
                "timestamp": (start + timedelta(hours=index))
                .isoformat()
                .replace("+00:00", "Z"),
                "values": {
                    "windU10Ms": 4.0 if index % 2 == 0 else -4.0,
                    "windV10Ms": 0.0,
                    "windSpeed10Ms": 4.0,
                    "windSpeed2Ms": 3.0,
                    "windDirectionDeg": 270.0 if index % 2 == 0 else 90.0,
                },
                "qualityFlags": [],
            }
            for index in range(24)
        ]
        values = aggregate_daily(
            rows, "America/Argentina/Buenos_Aires", "test-v1"
        )[0]["values"]
        self.assertNotIn("windDirectionDominantDeg", values)
        self.assertEqual(values["windDirectionResultantRatio"], 0.0)

    def test_metric_availability_counts_zero_and_flags_internal_gaps(self):
        start = datetime(2026, 8, 20, 3, tzinfo=timezone.utc)
        rows = [
            {
                "gridPointKey": "test-grid",
                "timestamp": (start + timedelta(hours=index))
                .isoformat()
                .replace("+00:00", "Z"),
                "values": {
                    "temperatureC": 10.0,
                    **({"dewPointC": 5.0} if index < 23 else {}),
                    "soilTemperatureC": [10.0, None, 12.0, 13.0],
                },
                "qualityFlags": [],
            }
            for index in range(24)
        ]
        daily = aggregate_daily(
            rows, "America/Argentina/Buenos_Aires", "test-v1"
        )[0]
        availability = daily["availableHoursByMetric"]
        self.assertEqual(availability["temperature"], 24)
        self.assertEqual(availability["dewPoint"], 23)
        self.assertEqual(availability["snowCover"], 0)
        self.assertEqual(availability["soilTemperature"], [24, 0, 24, 24])
        self.assertIn(
            "daily_incomplete_dew_point_within_available_hours",
            daily["qualityFlags"],
        )
        self.assertIn(
            "daily_incomplete_soil_temperature_layer_2_within_available_hours",
            daily["qualityFlags"],
        )

    def test_negative_precipitation_trace_is_clamped_and_outlier_is_quarantined(self):
        trace = derive_hourly(
            {
                "gridPointKey": "test-grid",
                "timestamp": "2026-08-20T12:00:00Z",
                "values": {"precipitationM": -0.000000029},
            },
            "test-v1",
            0.001,
        )
        self.assertEqual(trace["values"]["precipitationMm"], 0.0)
        self.assertIn(
            "precipitation_negative_artifact_clamped_to_zero",
            trace["qualityFlags"],
        )

        outlier = derive_hourly(
            {
                "gridPointKey": "test-grid",
                "timestamp": "2026-08-20T13:00:00Z",
                "values": {"precipitationM": -0.00001},
            },
            "test-v1",
            0.001,
        )
        self.assertNotIn("precipitationMm", outlier["values"])
        self.assertIn(
            "precipitation_negative_outside_tolerance_quarantined",
            outlier["qualityFlags"],
        )
        daily = aggregate_daily(
            [trace, outlier], "America/Argentina/Buenos_Aires", "test-v1"
        )
        self.assertNotIn("precipitationMm", daily[0]["values"])
        self.assertNotIn("precipitationMaxHourlyMm", daily[0]["values"])
        self.assertIn(
            "daily_precipitation_unavailable_negative_outlier",
            daily[0]["qualityFlags"],
        )

    def test_daily_window_reads_the_complete_local_days_from_persisted_hourly(self):
        records = [
            {
                "timestamp": "2026-09-01T00:00:00Z",
                "gridPointKey": "test-grid",
                "values": {},
            },
            {
                "timestamp": "2026-09-01T23:00:00Z",
                "gridPointKey": "test-grid",
                "values": {},
            },
        ]
        self.assertEqual(
            daily_utc_window(records, "America/Argentina/Buenos_Aires"),
            ("2026-08-31T03:00:00Z", "2026-09-02T04:00:00Z"),
        )

    def test_daily_completeness_uses_all_24_local_hours(self):
        start = datetime(2026, 8, 31, 3, tzinfo=timezone.utc)
        records = [
            {
                "timestamp": (start + timedelta(hours=index))
                .isoformat()
                .replace("+00:00", "Z"),
                "gridPointKey": "test-grid",
                "values": {"temperatureC": 10.0},
                "qualityFlags": [],
            }
            for index in range(24)
        ]
        full = aggregate_daily(
            records, "America/Argentina/Buenos_Aires", "test-v1"
        )
        self.assertEqual(len(full), 1)
        self.assertEqual(full[0]["hoursAvailable"], 24)
        self.assertEqual(full[0]["hoursExpected"], 24)
        self.assertNotIn(
            "daily_incomplete_less_than_expected_hours",
            full[0]["qualityFlags"],
        )
        incomplete = aggregate_daily(
            records[:21], "America/Argentina/Buenos_Aires", "test-v1"
        )
        self.assertEqual(incomplete[0]["hoursAvailable"], 21)
        self.assertIn(
            "daily_incomplete_less_than_expected_hours",
            incomplete[0]["qualityFlags"],
        )
        self.assertEqual(
            expected_hours_for_local_date(
                "2026-08-31", "America/Argentina/Buenos_Aires"
            ),
            24,
        )
        self.assertEqual(
            expected_hours_for_local_date("2026-04-04", "America/Santiago"),
            25,
        )
        self.assertEqual(
            expected_hours_for_local_date("2026-09-06", "America/Santiago"),
            23,
        )

    def test_next_utc_batch_completes_instead_of_overwriting_local_day(self):
        start = datetime(2026, 8, 31, 3, tzinfo=timezone.utc)

        def record(index):
            return {
                "timestamp": (start + timedelta(hours=index))
                .isoformat()
                .replace("+00:00", "Z"),
                "gridPointKey": "test-grid",
                "values": {"temperatureC": 10.0},
                "qualityFlags": [],
            }

        first_batch_persisted = [record(index) for index in range(21)]
        first_daily = aggregate_daily(
            first_batch_persisted,
            "America/Argentina/Buenos_Aires",
            "test-v1",
        )
        self.assertEqual(first_daily[0]["hoursAvailable"], 21)
        self.assertIn(
            "daily_incomplete_less_than_expected_hours",
            first_daily[0]["qualityFlags"],
        )

        second_batch_persisted = first_batch_persisted + [
            record(index) for index in range(21, 24)
        ]
        repaired_daily = aggregate_daily(
            second_batch_persisted,
            "America/Argentina/Buenos_Aires",
            "test-v1",
        )
        self.assertEqual(repaired_daily[0]["hoursAvailable"], 24)
        self.assertNotIn(
            "daily_incomplete_less_than_expected_hours",
            repaired_daily[0]["qualityFlags"],
        )


if __name__ == "__main__":
    unittest.main()
