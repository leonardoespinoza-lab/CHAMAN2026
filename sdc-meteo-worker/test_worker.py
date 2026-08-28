import unittest
from unittest.mock import patch
from datetime import date, datetime, timedelta, timezone
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

from config import BACKFILL_DAYS_PER_RUN
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

    def test_current_v2_coverage_resumes_after_last_derived_hour_not_raw(self):
        self.assertEqual(
            self.worker._next_start(
                {
                    "calculationVersion": "chaman-meteo-agro-v2",
                    "sourceVersion": "era5-land-timeseries-19var-v2",
                    "hourlyRawTo": "2026-08-22T23:00:00.000Z",
                    "hourlyDerivedFrom": "2026-08-01T00:00:00.000Z",
                    "hourlyDerivedTo": "2026-08-05T23:00:00.000Z",
                },
                {"historicalStart": "2026-08-01"},
            ),
            date(2026, 8, 6),
        )

    def test_v1_coverage_cannot_make_v2_look_complete(self):
        self.assertEqual(
            self.worker._next_start(
                {
                    "calculationVersion": "chaman-meteo-agro-v1",
                    "hourlyRawTo": "2026-08-22T23:00:00.000Z",
                    "hourlyDerivedTo": "2026-08-22T23:00:00.000Z",
                },
                {"historicalStart": "2026-08-01"},
            ),
            date(2026, 8, 1),
        )

    def test_partial_v2_coverage_that_does_not_begin_at_history_restarts_history(self):
        self.assertEqual(
            self.worker._next_start(
                {
                    "calculationVersion": "chaman-meteo-agro-v2",
                    "sourceVersion": "era5-land-timeseries-19var-v2",
                    "hourlyDerivedFrom": "2026-08-10T00:00:00.000Z",
                    "hourlyDerivedTo": "2026-08-12T23:00:00.000Z",
                    "hourlyRawTo": "2026-08-22T23:00:00.000Z",
                },
                {"historicalStart": "2026-08-01"},
            ),
            date(2026, 8, 1),
        )

    def test_v2_coverage_with_a_different_source_restarts_history(self):
        self.assertEqual(
            self.worker._next_start(
                {
                    "calculationVersion": "chaman-meteo-agro-v2",
                    "sourceVersion": "era5-land-timeseries-v1",
                    "hourlyDerivedFrom": "2026-08-01T00:00:00.000Z",
                    "hourlyDerivedTo": "2026-08-22T23:00:00.000Z",
                },
                {"historicalStart": "2026-08-01"},
            ),
            date(2026, 8, 1),
        )

    def test_legacy_unversioned_raw_fallback_is_limited_to_v1_engine(self):
        import worker as worker_module

        original = worker_module.CALCULATION_VERSION
        worker_module.CALCULATION_VERSION = "chaman-meteo-agro-v1"
        try:
            self.assertEqual(
                self.worker._next_start(
                    {"hourlyRawTo": "2026-08-22T23:00:00.000Z"},
                    {"historicalStart": "2026-08-01"},
                ),
                date(2026, 8, 23),
            )
        finally:
            worker_module.CALCULATION_VERSION = original

    def test_invalid_point_historical_start_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "historicalStart invalido"):
            self.worker._next_start(
                {},
                {"key": "bad-grid", "historicalStart": "2026-02-30"},
            )

    def test_point_cannot_move_global_historical_limit_backwards(self):
        with self.assertRaisesRegex(RuntimeError, "historicalStart fuera de rango"):
            self.worker._historical_start(
                {"key": "old-grid", "historicalStart": "2019-12-31"}
            )

    def test_global_historical_start_wins_over_older_valid_point_start(self):
        import worker as worker_module

        original = worker_module.HISTORICAL_START
        worker_module.HISTORICAL_START = "2022-01-01"
        try:
            self.assertEqual(
                self.worker._historical_start(
                    {"key": "grid", "historicalStart": "2021-01-01"}
                ),
                date(2022, 1, 1),
            )
        finally:
            worker_module.HISTORICAL_START = original

    def test_long_repair_is_split_into_bounded_idempotent_chunks(self):
        chunks = list(
            self.worker._repair_chunks(date(2020, 1, 1), date(2021, 2, 3))
        )
        self.assertGreater(len(chunks), 1)
        self.assertEqual(chunks[0][0], date(2020, 1, 1))
        self.assertEqual(chunks[-1][1], date(2021, 2, 3))
        for start, end in chunks:
            self.assertLessEqual((end - start).days + 1, BACKFILL_DAYS_PER_RUN)
        for previous, current in zip(chunks, chunks[1:]):
            self.assertEqual(previous[1] + timedelta(days=1), current[0])

    def test_repair_halo_covers_argentina_local_day(self):
        point = {
            "key": "ar-grid",
            "historicalStart": "2020-01-01",
            "timezone": "America/Argentina/Buenos_Aires",
        }
        self.assertEqual(
            self.worker._repair_retrieval_range(
                point,
                date(2026, 8, 20),
                date(2026, 8, 20),
                date(2026, 8, 25),
            ),
            (date(2026, 8, 19), date(2026, 8, 21)),
        )

    def test_repair_halo_covers_chile_dst_day(self):
        point = {
            "key": "cl-grid",
            "historicalStart": "2020-01-01",
            "timezone": "America/Santiago",
        }
        self.assertEqual(
            self.worker._repair_retrieval_range(
                point,
                date(2026, 9, 6),
                date(2026, 9, 6),
                date(2026, 9, 10),
            ),
            (date(2026, 9, 5), date(2026, 9, 7)),
        )

    def test_available_repair_job_is_not_repeated_without_force(self):
        self.worker._get = lambda _path, params=None: {
            "status": "AVAILABLE",
            "attempts": 1,
        }
        posts = []
        self.worker._post = lambda path, payload: posts.append(
            (path, dict(payload) if isinstance(payload, dict) else payload)
        ) or {}
        result = self.worker._import_range(
            {"key": "grid"},
            date(2026, 8, 20),
            date(2026, 8, 20),
            job_type="REPAIR",
        )
        self.assertTrue(result)
        self.assertEqual(
            posts,
            [
                (
                    "coverage/grid/recalculate",
                    {
                        "calculationVersion": "chaman-meteo-agro-v2",
                        "sourceVersion": "era5-land-timeseries-19var-v2",
                    },
                )
            ],
        )

    def test_available_backfill_reconciles_coverage_without_redownloading(self):
        self.worker._get = lambda _path, params=None: {
            "status": "AVAILABLE",
            "attempts": 2,
        }
        self.worker.cds = types.SimpleNamespace(
            retrieve=lambda *_args: self.fail("No debe redescargar")
        )
        posts = []
        self.worker._post = lambda path, payload: posts.append((path, payload)) or {}

        result = self.worker._import_range(
            {"key": "grid"},
            date(2026, 8, 20),
            date(2026, 8, 20),
        )

        self.assertTrue(result)
        self.assertEqual([path for path, _ in posts], ["coverage/grid/recalculate"])

    def test_backfill_retry_increments_existing_attempts(self):
        start = date(2026, 8, 20)
        raw = [self._complete_raw(start, hour) for hour in range(24)]
        self.worker.cds = types.SimpleNamespace(retrieve=lambda *_args: raw)
        self.worker._get = lambda path, params=None: (
            {"status": "FAILED", "attempts": 3}
            if path == "jobs/by-key"
            else None
        )
        self.worker._hourly_range = lambda *_args: []
        posts = []
        self.worker._post = lambda path, payload: posts.append(
            (path, dict(payload) if isinstance(payload, dict) else payload)
        ) or {}

        self.assertTrue(
            self.worker._import_range(
                {
                    "key": "grid",
                    "latitude": -38.0,
                    "longitude": -68.0,
                    "timezone": "America/Argentina/Buenos_Aires",
                },
                start,
                start,
            )
        )
        first_job = next(payload for path, payload in posts if path == "jobs/upsert")
        self.assertEqual(first_job["attempts"], 4)

    def test_download_validation_accepts_all_19_variables_and_zeroes(self):
        start = date(2026, 8, 20)
        raw = [self._complete_raw(start, hour) for hour in range(24)]
        self.assertEqual(self.worker._validate_download(raw, start, start), [])

    def test_download_validation_reports_missing_hour_and_variable(self):
        start = date(2026, 8, 20)
        raw = [self._complete_raw(start, hour) for hour in range(23)]
        del raw[0]["values"]["snowDepthM"]
        diagnostic = "; ".join(
            self.worker._validate_download(raw, start, start)
        )
        self.assertIn("missing=1", diagnostic)
        self.assertIn("snowDepthM=1", diagnostic)

    def test_incomplete_repair_is_persisted_as_partial_without_coverage_advance(self):
        start = date(2026, 8, 20)
        raw = [self._complete_raw(start, 0)]
        self.worker.cds = types.SimpleNamespace(retrieve=lambda *_args: raw)
        self.worker._get = lambda _path, params=None: None
        self.worker._hourly_range = lambda *_args: []
        posts = []
        self.worker._post = lambda path, payload: posts.append(
            (path, dict(payload) if isinstance(payload, dict) else payload)
        ) or {}

        result = self.worker._import_range(
            {
                "key": "grid",
                "latitude": -38.0,
                "longitude": -68.0,
                "timezone": "America/Argentina/Buenos_Aires",
            },
            start,
            start,
            job_type="REPAIR",
        )

        self.assertFalse(result)
        job_updates = [payload for path, payload in posts if path == "jobs/upsert"]
        self.assertEqual(job_updates[-1]["status"], "PARTIAL")
        self.assertIn("hour_coverage", job_updates[-1]["lastError"])
        self.assertFalse(any(path.startswith("coverage/") for path, _ in posts))
        self.assertFalse(any(path.startswith("hourly/") for path, _ in posts))

    def test_repair_halo_persists_daily_only_inside_requested_local_dates(self):
        requested = date(2026, 8, 20)
        retrieval_start = date(2026, 8, 19)
        retrieval_end = date(2026, 8, 21)
        raw = [
            self._complete_raw(retrieval_start, hour)
            for hour in range(3 * 24)
        ]
        self.worker.cds = types.SimpleNamespace(retrieve=lambda *_args: raw)
        self.worker._get = lambda _path, params=None: None
        persisted_hourly = []
        posts = []

        def post(path, payload):
            if path == "hourly/derived/upsert-many":
                persisted_hourly.extend(payload)
            posts.append((path, payload))
            return {}

        self.worker._post = post
        self.worker._hourly_range = lambda *_args: persisted_hourly

        self.assertTrue(
            self.worker._import_range(
                {
                    "key": "grid",
                    "latitude": -38.0,
                    "longitude": -68.0,
                    "timezone": "America/Argentina/Buenos_Aires",
                    "historicalStart": "2020-01-01",
                },
                requested,
                requested,
                job_type="REPAIR",
                retrieval_start=retrieval_start,
                retrieval_end=retrieval_end,
            )
        )

        daily_records = [
            record
            for path, payload in posts
            if path == "daily/upsert-many"
            for record in payload
        ]
        self.assertEqual([record["date"] for record in daily_records], ["2026-08-20"])

    def test_complete_import_writes_only_versioned_raw_and_exact_coverage(self):
        start = date(2026, 8, 20)
        raw = [self._complete_raw(start, hour) for hour in range(24)]
        self.worker.cds = types.SimpleNamespace(retrieve=lambda *_args: raw)
        self.worker._get = lambda _path, params=None: None
        self.worker._hourly_range = lambda *_args: []
        posts = []
        self.worker._post = lambda path, payload: posts.append((path, payload)) or {}

        result = self.worker._import_range(
            {
                "key": "grid",
                "latitude": -38.0,
                "longitude": -68.0,
                "timezone": "America/Argentina/Buenos_Aires",
            },
            start,
            start,
        )

        self.assertTrue(result)
        paths = [path for path, _ in posts]
        self.assertIn("hourly/raw/versions/upsert-many", paths)
        self.assertNotIn("hourly/raw/upsert-many", paths)
        coverage_payloads = [
            payload
            for path, payload in posts
            if path == "coverage/grid/recalculate"
        ]
        self.assertEqual(
            coverage_payloads,
            [
                {
                    "calculationVersion": "chaman-meteo-agro-v2",
                    "sourceVersion": "era5-land-timeseries-19var-v2",
                }
            ],
        )
        available_index = next(
            index
            for index, (path, payload) in enumerate(posts)
            if path == "jobs/upsert" and payload.get("status") == "AVAILABLE"
        )
        coverage_index = next(
            index
            for index, (path, _payload) in enumerate(posts)
            if path == "coverage/grid/recalculate"
        )
        self.assertLess(available_index, coverage_index)

    def test_finalization_failure_never_downgrades_job_to_failed(self):
        start = date(2026, 8, 20)
        raw = [self._complete_raw(start, hour) for hour in range(24)]
        self.worker.cds = types.SimpleNamespace(retrieve=lambda *_args: raw)
        self.worker._get = lambda _path, params=None: None
        self.worker._hourly_range = lambda *_args: []
        posts = []

        def post(path, payload):
            posts.append(
                (path, dict(payload) if isinstance(payload, dict) else payload)
            )
            if path == "coverage/grid/recalculate":
                raise RuntimeError("respuesta de coverage perdida")
            return {}

        self.worker._post = post
        result = self.worker._import_range(
            {
                "key": "grid",
                "latitude": -38.0,
                "longitude": -68.0,
                "timezone": "America/Argentina/Buenos_Aires",
            },
            start,
            start,
        )

        self.assertFalse(result)
        final_states = [
            payload.get("status")
            for path, payload in posts
            if path == "jobs/upsert"
        ]
        self.assertEqual(final_states[-1], "AVAILABLE")
        self.assertNotIn("FAILED", final_states)

    def test_available_repair_retries_coverage_and_surfaces_failure(self):
        self.worker._get = lambda _path, params=None: {
            "status": "AVAILABLE",
            "attempts": 1,
        }

        def post(path, _payload):
            if path == "coverage/grid/recalculate":
                raise RuntimeError("coverage temporalmente no disponible")
            return {}

        self.worker._post = post
        with self.assertRaisesRegex(RuntimeError, "coverage temporalmente"):
            self.worker._import_range(
                {"key": "grid"},
                date(2026, 8, 20),
                date(2026, 8, 20),
                job_type="REPAIR",
            )

    def test_process_reads_only_the_exact_versioned_coverage(self):
        class Lock:
            def acquire(self, blocking=False):
                return True

            def release(self):
                return None

        self.worker.redis = types.SimpleNamespace(lock=lambda *_args, **_kwargs: Lock())
        calls = []

        def get(path, params=None):
            calls.append((path, params))
            return {
                "calculationVersion": "chaman-meteo-agro-v2",
                "sourceVersion": "era5-land-timeseries-19var-v2",
                "hourlyDerivedFrom": "2026-08-01T00:00:00.000Z",
                "hourlyDerivedTo": "2026-08-20T23:00:00.000Z",
            }

        self.worker._get = get
        self.worker._import_range = lambda *_args, **_kwargs: self.fail(
            "El punto exacto ya estaba al dia"
        )
        self.worker._process_point(
            {
                "key": "grid",
                "latitude": -38.0,
                "longitude": -68.0,
                "countryCode": "AR",
                "timezone": "America/Argentina/Buenos_Aires",
                "historicalStart": "2026-08-01",
            },
            date(2026, 8, 20),
        )

        self.assertEqual(
            calls,
            [
                (
                    "coverage/grid",
                    {
                        "calculationVersion": "chaman-meteo-agro-v2",
                        "sourceVersion": "era5-land-timeseries-19var-v2",
                    },
                )
            ],
        )

    def test_point_requires_country_coordinates_and_iana_timezone(self):
        valid = {
            "key": "cl-grid",
            "latitude": -33.45,
            "longitude": -70.66,
            "countryCode": "CL",
            "timezone": "America/Santiago",
            "historicalStart": "2020-01-01",
        }
        self.assertEqual(
            self.worker._validated_point(valid)["timezone"],
            "America/Santiago",
        )
        for field, value, message in (
            ("timezone", None, "timezone requerido"),
            ("timezone", "America/NoExiste", "timezone IANA invalido"),
            ("countryCode", None, "countryCode invalido"),
            ("latitude", 91, "Latitud fuera de rango"),
        ):
            candidate = {**valid, field: value}
            with self.subTest(field=field, value=value):
                with self.assertRaisesRegex(RuntimeError, message):
                    self.worker._validated_point(candidate)

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

    def test_grid_points_reads_every_page_beyond_worker_page_size(self):
        pages = {
            0: {
                "datos": [{"key": f"grid-{index}"} for index in range(500)],
                "total": 501,
            },
            500: {"datos": [{"key": "grid-500"}], "total": 501},
        }
        calls = []

        def get(path, params=None):
            self.assertEqual(path, "grid-points")
            calls.append(params)
            return pages[params["offset"]]

        self.worker._get = get
        points = self.worker._all_grid_points()

        self.assertEqual(len(points), 501)
        self.assertEqual([call["offset"] for call in calls], [0, 500])

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

    def test_run_once_returns_nonzero_when_cycle_raises(self):
        import worker as worker_module

        fake_worker = types.SimpleNamespace(
            initialize=lambda: None,
            run_cycle=lambda: (_ for _ in ()).throw(
                RuntimeError("reparacion incompleta")
            ),
        )
        with (
            patch.object(worker_module, "RUN_ONCE", True),
            patch.object(worker_module, "CHAMAN_METEO_ENABLED", True),
            patch.object(worker_module, "CHAMAN_METEO_IMPORT_ENABLED", True),
            patch.object(worker_module, "start_health_server"),
            patch.object(worker_module, "ChamanMeteoWorker", return_value=fake_worker),
        ):
            self.assertEqual(worker_module.main(), 1)

    def test_run_once_returns_nonzero_when_cycle_reports_point_errors(self):
        import worker as worker_module

        def run_cycle():
            STATE.last_error = "grid: importacion incompleta"

        fake_worker = types.SimpleNamespace(
            initialize=lambda: None,
            run_cycle=run_cycle,
        )
        with (
            patch.object(worker_module, "RUN_ONCE", True),
            patch.object(worker_module, "CHAMAN_METEO_ENABLED", True),
            patch.object(worker_module, "CHAMAN_METEO_IMPORT_ENABLED", True),
            patch.object(worker_module, "start_health_server"),
            patch.object(worker_module, "ChamanMeteoWorker", return_value=fake_worker),
        ):
            self.assertEqual(worker_module.main(), 1)

    def test_run_once_returns_zero_only_after_a_clean_cycle(self):
        import worker as worker_module

        fake_worker = types.SimpleNamespace(
            initialize=lambda: None,
            run_cycle=lambda: setattr(STATE, "last_error", None),
        )
        with (
            patch.object(worker_module, "RUN_ONCE", True),
            patch.object(worker_module, "CHAMAN_METEO_ENABLED", True),
            patch.object(worker_module, "CHAMAN_METEO_IMPORT_ENABLED", True),
            patch.object(worker_module, "start_health_server"),
            patch.object(worker_module, "ChamanMeteoWorker", return_value=fake_worker),
        ):
            self.assertEqual(worker_module.main(), 0)

    def _complete_raw(self, day: date, hour: int) -> dict:
        timestamp = datetime.combine(
            day, datetime.min.time(), tzinfo=timezone.utc
        ) + timedelta(hours=hour)
        return {
            "gridPointKey": "grid",
            "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
            "values": {
                "temperatureK": 293.15,
                "dewPointK": 283.15,
                "surfacePressurePa": 100000.0,
                "precipitationM": 0.0,
                "shortwaveRadiationJm2": 0.0,
                "thermalRadiationJm2": 0.0,
                "windU10Ms": 0.0,
                "windV10Ms": 0.0,
                "skinTemperatureK": 293.15,
                "snowCoverFraction": 0.0,
                "snowDepthM": 0.0,
                "soilTemperatureK": [293.15, 293.15, 293.15, 293.15],
                "soilWaterM3M3": [0.0, 0.0, 0.0, 0.0],
            },
        }


if __name__ == "__main__":
    unittest.main()
