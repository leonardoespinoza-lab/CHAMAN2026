import unittest
from datetime import datetime, timedelta, timezone

from calculations import (
    aggregate_daily,
    daily_utc_window,
    derive_hourly,
    expected_hours_for_local_date,
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
            },
        }
        hourly = derive_hourly(raw, "test-v1")
        self.assertAlmostEqual(hourly["values"]["temperatureC"], 20.0, places=6)
        self.assertAlmostEqual(
            hourly["values"]["relativeHumidityPct"], 52.5, delta=0.3
        )
        self.assertAlmostEqual(hourly["values"]["precipitationMm"], 1.0)
        daily = aggregate_daily([hourly], "America/Argentina/Buenos_Aires", "test-v1")
        self.assertEqual(len(daily), 1)
        self.assertAlmostEqual(
            daily[0]["values"]["relativeHumidityMeanPct"], 52.5, delta=0.3
        )
        self.assertEqual(daily[0]["hoursExpected"], 24)
        self.assertIn(
            "daily_incomplete_less_than_expected_hours",
            daily[0]["qualityFlags"],
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
            ("2026-08-31T03:00:00Z", "2026-09-02T03:00:00Z"),
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
