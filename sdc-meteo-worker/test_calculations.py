import unittest

from calculations import (
    aggregate_daily,
    derive_hourly,
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
        self.assertIn("daily_incomplete_less_than_20_hours", daily[0]["qualityFlags"])


if __name__ == "__main__":
    unittest.main()
