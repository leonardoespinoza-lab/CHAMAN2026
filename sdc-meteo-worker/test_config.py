import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import config


class WorkerConfigImportTest(unittest.TestCase):
    def import_config(self, **variables):
        environment = os.environ.copy()
        for name in (
            "CHAMAN_METEO_REPAIR_GRID_POINT",
            "CHAMAN_METEO_REPAIR_FROM",
            "CHAMAN_METEO_REPAIR_TO",
            "CHAMAN_METEO_REPAIR_FORCE",
        ):
            environment.pop(name, None)
        calculation_version = variables.pop(
            "CHAMAN_METEO_CALCULATION_VERSION", "chaman-meteo-agro-v2"
        )
        source_version = variables.pop(
            "CHAMAN_METEO_SOURCE_VERSION", "era5-land-timeseries-19var-v2"
        )
        environment.update(variables)
        environment["CHAMAN_METEO_CALCULATION_VERSION"] = calculation_version
        environment["CHAMAN_METEO_SOURCE_VERSION"] = source_version
        return subprocess.run(
            [sys.executable, "-c", "import config"],
            capture_output=True,
            check=False,
            cwd=Path(__file__).parent,
            env=environment,
            text=True,
        )

    def test_rejects_non_official_cds_endpoint(self):
        result = self.import_config(CDS_API_URL="https://example.com/api")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("endpoint oficial", result.stderr)

    def test_rejects_invalid_historical_date(self):
        result = self.import_config(CHAMAN_METEO_HISTORICAL_START="2026-02-30")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("formato YYYY-MM-DD", result.stderr)

    def test_rejects_invalid_negative_precipitation_tolerance(self):
        result = self.import_config(
            CHAMAN_METEO_NEGATIVE_PRECIPITATION_TOLERANCE_MM="-1"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("debe estar entre 0 y 1", result.stderr)

    def test_import_fails_closed_with_legacy_calculation_label(self):
        result = self.import_config(
            CHAMAN_METEO_CALCULATION_VERSION="chaman-meteo-agro-v1"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("debe ser exactamente chaman-meteo-agro-v2", result.stderr)

    def test_import_fails_closed_with_legacy_source_label(self):
        result = self.import_config(
            CHAMAN_METEO_SOURCE_VERSION="era5-land-timeseries-v1"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "debe ser exactamente era5-land-timeseries-19var-v2",
            result.stderr,
        )


class ChamanMeteoConfigTest(unittest.TestCase):
    repair_variables = {
        "CHAMAN_METEO_REPAIR_GRID_POINT",
        "CHAMAN_METEO_REPAIR_FROM",
        "CHAMAN_METEO_REPAIR_TO",
    }

    def _environment(self, values: dict):
        clean = {key: value for key, value in os.environ.items() if key not in self.repair_variables}
        clean.update(values)
        return patch.dict(os.environ, clean, clear=True)

    def test_repair_is_disabled_when_no_explicit_range_is_configured(self):
        with self._environment({}):
            original_force = config.REPAIR_FORCE
            config.REPAIR_FORCE = False
            try:
                self.assertIsNone(config.configured_repair())
            finally:
                config.REPAIR_FORCE = original_force

    def test_v2_worker_accepts_only_the_exact_calculation_version(self):
        with patch.dict(
            os.environ,
            {"CHAMAN_METEO_CALCULATION_VERSION": "chaman-meteo-agro-v2"},
        ):
            self.assertEqual(
                config.locked_version(
                    "CHAMAN_METEO_CALCULATION_VERSION",
                    "chaman-meteo-agro-v2",
                ),
                "chaman-meteo-agro-v2",
            )
        for invalid in (
            "chaman-meteo-agro-v1",
            "custom-v2",
            "",
            " chaman-meteo-agro-v2 ",
        ):
            with self.subTest(invalid=invalid):
                with patch.dict(
                    os.environ,
                    {"CHAMAN_METEO_CALCULATION_VERSION": invalid},
                ):
                    with self.assertRaisesRegex(RuntimeError, "exactamente"):
                        config.locked_version(
                            "CHAMAN_METEO_CALCULATION_VERSION",
                            "chaman-meteo-agro-v2",
                        )

    def test_v2_worker_accepts_only_the_exact_19_variable_source_version(self):
        with patch.dict(
            os.environ,
            {
                "CHAMAN_METEO_SOURCE_VERSION": "era5-land-timeseries-19var-v2"
            },
        ):
            self.assertEqual(
                config.locked_version(
                    "CHAMAN_METEO_SOURCE_VERSION",
                    "era5-land-timeseries-19var-v2",
                ),
                "era5-land-timeseries-19var-v2",
            )
        for invalid in (
            "era5-land-timeseries-v1",
            "era5-custom",
            "",
            " era5-land-timeseries-19var-v2 ",
        ):
            with self.subTest(invalid=invalid):
                with patch.dict(
                    os.environ,
                    {"CHAMAN_METEO_SOURCE_VERSION": invalid},
                ):
                    with self.assertRaisesRegex(RuntimeError, "exactamente"):
                        config.locked_version(
                            "CHAMAN_METEO_SOURCE_VERSION",
                            "era5-land-timeseries-19var-v2",
                        )

    def test_partial_repair_configuration_fails_closed(self):
        with self._environment({"CHAMAN_METEO_REPAIR_GRID_POINT": "grid"}):
            with self.assertRaisesRegex(RuntimeError, "requiere"):
                config.configured_repair()

    def test_repair_requires_run_once(self):
        with self._environment(
            {
                "CHAMAN_METEO_REPAIR_GRID_POINT": "grid",
                "CHAMAN_METEO_REPAIR_FROM": "2026-08-01",
                "CHAMAN_METEO_REPAIR_TO": "2026-08-02",
            }
        ):
            original_run_once = config.RUN_ONCE
            config.RUN_ONCE = False
            try:
                with self.assertRaisesRegex(RuntimeError, "RUN_ONCE=true"):
                    config.configured_repair()
            finally:
                config.RUN_ONCE = original_run_once

    def test_repair_cannot_precede_global_2020_history_boundary(self):
        with self._environment(
            {
                "CHAMAN_METEO_REPAIR_GRID_POINT": "grid",
                "CHAMAN_METEO_REPAIR_FROM": "2019-12-31",
                "CHAMAN_METEO_REPAIR_TO": "2020-01-01",
            }
        ):
            original_run_once = config.RUN_ONCE
            config.RUN_ONCE = True
            try:
                with self.assertRaisesRegex(RuntimeError, "HISTORICAL_START"):
                    config.configured_repair()
            finally:
                config.RUN_ONCE = original_run_once

    def test_valid_repair_keeps_force_disabled_by_default(self):
        with self._environment(
            {
                "CHAMAN_METEO_REPAIR_GRID_POINT": "grid",
                "CHAMAN_METEO_REPAIR_FROM": "2026-08-01",
                "CHAMAN_METEO_REPAIR_TO": "2026-08-02",
            }
        ):
            original_run_once = config.RUN_ONCE
            original_force = config.REPAIR_FORCE
            config.RUN_ONCE = True
            config.REPAIR_FORCE = False
            try:
                request = config.configured_repair()
            finally:
                config.RUN_ONCE = original_run_once
                config.REPAIR_FORCE = original_force
        self.assertEqual(request["gridPointKey"], "grid")
        self.assertFalse(request["force"])


if __name__ == "__main__":
    unittest.main()
