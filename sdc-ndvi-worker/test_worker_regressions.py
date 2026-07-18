import unittest
from datetime import datetime, timezone
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import numpy as np
from shapely.geometry import Polygon

import worker as worker_module
from reliable_queue import PermanentTaskError, TransientTaskError
from worker import NDVIWorker, validated_satellite_index_mean


class NDVIWorkerRegressionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.worker = NDVIWorker()

    async def asyncTearDown(self):
        await self.worker.http_client.aclose()

    async def test_fatal_worker_failure_propagates_for_railway_restart(self):
        failed_worker = MagicMock()
        failed_worker.run = AsyncMock(side_effect=RuntimeError("redis unavailable"))
        failed_worker.http_client.aclose = AsyncMock()

        with (
            patch.object(worker_module, "start_health_server"),
            patch.object(worker_module, "NDVIWorker", return_value=failed_worker),
        ):
            with self.assertRaisesRegex(RuntimeError, "redis unavailable"):
                await worker_module.main()

        failed_worker.http_client.aclose.assert_awaited_once()

    async def test_invalid_task_is_permanent_and_not_acknowledged_directly(self):
        self.worker._validate_polygon = MagicMock(
            side_effect=ValueError("poligono invalido")
        )

        with patch.object(worker_module, "CLEAN_UP", "false"):
            with self.assertRaises(PermanentTaskError):
                await self.worker.process_task(
                    {
                        "lote_id": "lote-1",
                        "polygon": [],
                        "dedupe_key": "ndvi-task:lote-1:latest:normal",
                        "dedupe_token": "token-1",
                    }
                )

    async def test_skips_a_known_prior_sentinel_quality_replacement(self):
        self.worker._validate_polygon = MagicMock(
            return_value=Polygon(
                [(-68.1, -38.9), (-68.0, -38.9), (-68.0, -38.8)]
            )
        )
        self.worker._get_scene_data = AsyncMock(
            return_value={
                "id": "sentinel-known",
                "datetime": datetime(2026, 7, 5, tzinfo=timezone.utc),
                "collection": "sentinel-2-l2a",
            }
        )
        self.worker._process_ndvi = AsyncMock()

        with patch.object(worker_module, "CLEAN_UP", "false"):
            result = await self.worker.process_task(
                {
                    "lote_id": "lote-1",
                    "polygon": [],
                    "scene_datetime": "2026-07-10T10:00:00.000Z",
                    "scene_collection": "landsat-c2-l2",
                    "known_scenes": [
                        {
                            "date": "2026-07-05T10:00:00.000Z",
                            "collection": "sentinel-2-l2a",
                        }
                    ],
                    "dedupe_key": "ndvi-task:lote-1:2026-07-10:normal",
                    "dedupe_token": "token-2",
                }
            )

        self.worker._process_ndvi.assert_not_awaited()
        self.assertEqual(result["status"], "known_scene")

    async def test_exact_backfill_limits_stac_search_to_requested_day(self):
        fake_search = MagicMock()
        fake_search.items.return_value = []
        fake_client = MagicMock()
        fake_client.search.return_value = fake_search
        requested = datetime(2026, 6, 15, 10, 30, tzinfo=timezone.utc)

        with patch.object(worker_module.Client, "open", return_value=fake_client):
            await self.worker.find_latest_sentinel_scene(
                Polygon(
                    [(-68.1, -38.9), (-68.0, -38.9), (-68.0, -38.8)]
                ),
                start_date=requested,
                exact_scene_date=True,
            )

        datetime_filter = fake_client.search.call_args_list[0].kwargs["datetime"]
        self.assertTrue(datetime_filter.startswith("2026-06-15T00:00:00"))
        self.assertIn("/2026-06-15T23:59:59.999999", datetime_filter)

    def test_exact_backfill_rejects_a_different_scene_day(self):
        self.assertTrue(
            self.worker._is_scene_processed(
                datetime(2026, 6, 16, tzinfo=timezone.utc),
                datetime(2026, 6, 15, tzinfo=timezone.utc),
                "sentinel-2-l2a",
                "sentinel-2-l2a",
                True,
                True,
            )
        )

    async def test_backend_post_503_is_a_transient_task_failure(self):
        response = httpx.Response(
            503,
            request=httpx.Request(
                "POST", "https://backend.example/ndvi/crear-reporte"
            ),
        )
        self.worker.http_client.post = AsyncMock(return_value=response)

        with self.assertRaises(TransientTaskError) as raised:
            await self.worker._notify_backend(
                "lote-1",
                {
                    "ndvi_promedio": 0.55,
                    "fecha_imagen": "2026-07-10T10:00:00+00:00",
                    "url_png": "https://storage.example/ndvi.png",
                    "indices": {"ndvi": 0.55},
                    "imagenes": {},
                    "metadata": {"qualityMask": {"validCoveragePct": 87.5}},
                    "coleccion": "sentinel-2-l2a",
                },
            )

        self.assertEqual(raised.exception.code, "backend_http_503")

    def test_validated_index_mean_requires_masked_value_and_minimum_coverage(self):
        self.assertEqual(
            validated_satellite_index_mean(
                {"ndvi": 0.43},
                {"validCoveragePct": 3.0},
            ),
            0.43,
        )
        self.assertIsNone(
            validated_satellite_index_mean(
                {"ndvi": 0.43},
                {"validCoveragePct": 2.99},
            )
        )
        self.assertIsNone(validated_satellite_index_mean({"ndvi": 0.43}, {}))
        self.assertIsNone(
            validated_satellite_index_mean(
                {"ndvi": 1.2},
                {"validCoveragePct": 90},
            )
        )

    async def test_backend_rejects_ndvi_without_quality_evidence(self):
        self.worker.http_client.post = AsyncMock()

        with self.assertRaises(PermanentTaskError) as raised:
            await self.worker._notify_backend(
                "lote-1",
                {
                    "ndvi_promedio": 0.55,
                    "fecha_imagen": "2026-07-10T10:00:00+00:00",
                    "url_png": "https://storage.example/ndvi.png",
                    "indices": {"ndvi": 0.55},
                    "imagenes": {},
                    "metadata": {},
                    "coleccion": "sentinel-2-l2a",
                },
            )

        self.assertEqual(raised.exception.code, "invalid_ndvi_quality")
        self.worker.http_client.post.assert_not_awaited()

    async def test_processing_does_not_fallback_to_raw_ndvi_when_masked_qa_fails(self):
        raster = MagicMock()
        raster.transform.is_identity = False
        raster.nodata = -999
        raster.read.return_value = np.array([[0.2]], dtype="float32")
        raster_context = MagicMock()
        raster_context.__enter__.return_value = raster
        raster_context.__exit__.return_value = False

        async def execute(func, *args):
            if func is worker_module.calcular_ndvi:
                return np.array([[0.78]], dtype="float32"), {}
            if func is worker_module.calcular_indices_y_rasters:
                raise RuntimeError("quality mask unavailable")
            if func is worker_module.recortar_ndvi:
                return True
            return None

        self.worker._run_in_executor = AsyncMock(side_effect=execute)
        scene = {
            "b4_path": "B04.tif",
            "b8_path": "B08.tif",
            "band_paths": {},
            "datetime": datetime(2026, 7, 10, tzinfo=timezone.utc),
            "collection": "sentinel-2-l2a",
        }

        with TemporaryDirectory() as temp_dir:
            with (
                patch.object(worker_module, "DOWNLOAD_FOLDER", temp_dir),
                patch.object(worker_module.rasterio, "open", return_value=raster_context),
            ):
                result = await self.worker._process_ndvi(
                    "lote-qa",
                    Polygon([(-68.1, -38.9), (-68.0, -38.9), (-68.0, -38.8)]),
                    scene,
                )

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
