import unittest
from datetime import date
import sys
import types

redis_module = types.ModuleType("redis")
redis_module.Redis = object
redis_module.exceptions = types.SimpleNamespace(LockError=RuntimeError)
sys.modules.setdefault("redis", redis_module)
sys.modules.setdefault("cdsapi", types.SimpleNamespace(Client=object))
requests_module = types.ModuleType("requests")
requests_module.Session = object
requests_module.exceptions = types.SimpleNamespace(JSONDecodeError=ValueError)
sys.modules.setdefault("requests", requests_module)

from worker import ChamanMeteoWorker
from health import STATE


class ChamanMeteoWorkerTest(unittest.TestCase):
    def setUp(self):
        self.worker = ChamanMeteoWorker.__new__(ChamanMeteoWorker)

    def tearDown(self):
        STATE.last_error = None

    def test_point_historical_start_precedes_global_default_without_coverage(self):
        self.assertEqual(
            self.worker._next_start({}, {"historicalStart": "2026-08-01"}),
            date(2026, 8, 1),
        )

    def test_existing_coverage_resumes_after_last_hour(self):
        self.assertEqual(
            self.worker._next_start(
                {"hourlyRawTo": "2026-08-22T23:00:00.000Z"},
                {"historicalStart": "2026-08-01"},
            ),
            date(2026, 8, 23),
        )

    def test_invalid_point_historical_start_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "historicalStart invalido"):
            self.worker._next_start(
                {},
                {"key": "bad-grid", "historicalStart": "2026-02-30"},
            )

    def test_hourly_range_reads_every_persisted_page(self):
        pages = {
            0: {"datos": [{"timestamp": "a"}], "total": 2},
            1: {"datos": [{"timestamp": "b"}], "total": 2},
        }
        calls = []

        def fake_get(path, params=None):
            calls.append((path, params))
            return pages[params["offset"]]

        self.worker._get = fake_get
        self.assertEqual(
            self.worker._hourly_range("grid", "from", "to"),
            [{"timestamp": "a"}, {"timestamp": "b"}],
        )
        self.assertEqual([call[1]["offset"] for call in calls], [0, 1])

    def test_invalid_point_does_not_stop_the_remaining_cycle(self):
        self.worker._get = lambda _path, params=None: {
            "datos": [{"key": "bad-grid"}, {"key": "good-grid"}]
        }
        self.worker._latest_available_date = lambda: date(2026, 8, 22)
        visited = []

        def process(point, _latest):
            visited.append(point["key"])
            if point["key"] == "bad-grid":
                raise RuntimeError("historicalStart invalido")

        self.worker._process_point = process
        self.worker._safe_error = lambda error: str(error)
        self.worker.run_cycle()

        self.assertEqual(visited, ["bad-grid", "good-grid"])
        self.assertIn("bad-grid", STATE.last_error)


if __name__ == "__main__":
    unittest.main()
