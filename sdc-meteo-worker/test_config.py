import os
import subprocess
import sys
import unittest
from pathlib import Path


class WorkerConfigTest(unittest.TestCase):
    def import_config(self, **variables):
        environment = os.environ.copy()
        environment.update(variables)
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


if __name__ == "__main__":
    unittest.main()
