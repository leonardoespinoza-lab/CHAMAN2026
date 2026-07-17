import json
import time
import unittest
import asyncio
from collections import defaultdict
from unittest.mock import AsyncMock, patch

from reliable_queue import (
    PermanentTaskError,
    QueueLeaseLostError,
    ReliableRedisQueue,
    TransientTaskError,
)


class FakeRedis:
    """Implementacion minima que ejercita las transiciones de los scripts."""

    def __init__(self):
        self.lists = defaultdict(list)
        self.strings = {}
        self.zsets = defaultdict(dict)

    async def lpush(self, key, value):
        self.lists[key].insert(0, self._text(value))
        return len(self.lists[key])

    async def lrange(self, key, start, end):
        values = self.lists[key]
        if end == -1:
            return list(values[start:])
        return list(values[start : end + 1])

    async def get(self, key):
        return self.strings.get(key)

    async def eval(self, script, numkeys, *arguments):
        keys = list(arguments[:numkeys])
        argv = list(arguments[numkeys:])

        if "ndvi:claim" in script:
            pending, processing, lease = keys
            if not self.lists[pending]:
                return None
            payload = self.lists[pending].pop()
            envelope = json.dumps(
                {
                    "claim_id": self._text(argv[0]),
                    "claimed_at": float(argv[1]),
                    "worker_id": self._text(argv[2]),
                    "payload": payload,
                },
                separators=(",", ":"),
            )
            self.lists[processing].insert(0, envelope)
            self.strings[lease] = self._text(argv[2])
            return envelope

        if "ndvi:ack" in script:
            processing, lease = keys
            removed = self._lrem(processing, self._text(argv[0]))
            if removed:
                self.strings.pop(lease, None)
            return removed

        if "ndvi:retry" in script:
            processing, lease, retry = keys
            removed = self._lrem(processing, self._text(argv[0]))
            if removed:
                self.strings.pop(lease, None)
                self.zsets[retry][self._text(argv[2])] = float(argv[1])
            return removed

        if "ndvi:dlq" in script:
            processing, lease, dlq = keys
            removed = self._lrem(processing, self._text(argv[0]))
            if removed:
                self.strings.pop(lease, None)
                self.lists[dlq].append(self._text(argv[1]))
            return removed

        if "ndvi:recover" in script:
            pending, processing, lease = keys
            if lease in self.strings:
                return 0
            removed = self._lrem(processing, self._text(argv[0]))
            if removed:
                self.lists[pending].insert(0, self._text(argv[1]))
            return removed

        if "ndvi:promote" in script:
            retry, pending = keys
            now = float(argv[0])
            limit = int(argv[1])
            due = sorted(
                (
                    (score, member)
                    for member, score in self.zsets[retry].items()
                    if score <= now
                ),
                key=lambda item: (item[0], item[1]),
            )[:limit]
            for _, member in due:
                self.zsets[retry].pop(member, None)
                decoded = json.loads(member)
                self.lists[pending].insert(0, decoded["payload"])
            return len(due)

        if "ndvi:heartbeat" in script:
            lease = keys[0]
            return int(self.strings.get(lease) == self._text(argv[0]))

        if "ndvi:complete" in script:
            self.strings[keys[0]] = "1"
            return "OK"

        raise AssertionError("Script Redis no reconocido por FakeRedis")

    def _lrem(self, key, value):
        values = self.lists[key]
        try:
            values.remove(value)
        except ValueError:
            return 0
        return 1

    @staticmethod
    def _text(value):
        return value.decode("utf-8") if isinstance(value, bytes) else str(value)


class ReliableRedisQueueTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.redis = FakeRedis()
        self.queue = ReliableRedisQueue(
            self.redis,
            "tareas-ndvi",
            max_attempts=3,
            retry_base_seconds=0,
            retry_max_seconds=0,
            visibility_timeout_seconds=5,
            poll_seconds=0.01,
            worker_id="worker-test",
        )
        await self.queue.initialize()

    async def enqueue(self, task):
        await self.redis.lpush("tareas-ndvi", json.dumps(task))
        claim = await self.queue.claim()
        self.assertIsNotNone(claim)
        return claim

    async def test_success_acknowledges_only_after_processor_finishes(self):
        task = {
            "lote_id": "lote-1",
            "polygon": [],
            "dedupe_key": "ndvi-task:lote-1:latest:normal",
            "dedupe_token": "token-1",
        }
        claim = await self.enqueue(task)
        processor = AsyncMock(return_value={"status": "processed"})
        release = AsyncMock()

        result = await self.queue.execute(claim, processor, release)

        self.assertEqual(result.outcome, "ack")
        processor.assert_awaited_once()
        release.assert_awaited_once_with(
            "ndvi-task:lote-1:latest:normal", "token-1"
        )
        self.assertEqual(self.redis.lists[self.queue.processing_name], [])
        self.assertNotIn(claim.lease_key, self.redis.strings)

        duplicate_claim = await self.enqueue(task)
        duplicate_processor = AsyncMock()
        duplicate = await self.queue.execute(
            duplicate_claim, duplicate_processor, release
        )
        self.assertEqual(duplicate.outcome, "deduplicated")
        duplicate_processor.assert_not_awaited()

    async def test_transient_failure_is_retried_with_incremented_attempt(self):
        claim = await self.enqueue({"lote_id": "lote-2", "polygon": []})
        first = AsyncMock(
            side_effect=TransientTaskError(
                "STAC temporalmente no disponible", code="stac_unavailable"
            )
        )

        result = await self.queue.execute(claim, first)
        self.assertEqual(result.outcome, "retry")
        self.assertEqual(len(self.redis.zsets[self.queue.retry_name]), 1)

        self.assertEqual(await self.queue.promote_due_retries(), 1)
        retry_claim = await self.queue.claim()
        retried_task = self.queue.decode_task(retry_claim.payload_raw)
        self.assertEqual(retried_task["_queue"]["attempt"], 2)

        result = await self.queue.execute(retry_claim, AsyncMock())
        self.assertEqual(result.outcome, "ack")

    async def test_permanent_failure_goes_directly_to_dlq_and_redacts_tokens(self):
        claim = await self.enqueue(
            {
                "lote_id": "lote-3",
                "polygon": [],
                "dedupe_key": "ndvi-task:lote-3:latest:normal",
                "dedupe_token": "token-3",
                "access_token": "no-debe-persistirse",
            }
        )
        processor = AsyncMock(
            side_effect=PermanentTaskError(
                "Geometria invalida", code="invalid_geometry"
            )
        )
        release = AsyncMock()

        result = await self.queue.execute(claim, processor, release)

        self.assertEqual(result.outcome, "dlq")
        self.assertEqual(len(self.redis.lists[self.queue.dlq_name]), 1)
        dlq = json.loads(self.redis.lists[self.queue.dlq_name][0])
        self.assertEqual(dlq["error_code"], "invalid_geometry")
        self.assertEqual(dlq["task"]["access_token"], "[REDACTED]")
        release.assert_awaited_once_with(
            "ndvi-task:lote-3:latest:normal", "token-3"
        )

    async def test_abandoned_task_is_recovered_after_lease_expires(self):
        claim = await self.enqueue({"lote_id": "lote-4", "polygon": []})
        envelope = json.loads(claim.envelope_raw)
        envelope["claimed_at"] = time.time() - 30
        stale_raw = json.dumps(envelope, separators=(",", ":"))
        self.redis.lists[self.queue.processing_name][0] = stale_raw
        self.redis.strings.pop(claim.lease_key, None)

        recovered = await self.queue.recover_abandoned()

        self.assertEqual(recovered, 1)
        self.assertEqual(self.redis.lists[self.queue.processing_name], [])
        recovered_claim = await self.queue.claim()
        task = self.queue.decode_task(recovered_claim.payload_raw)
        self.assertEqual(task["_queue"]["recoveries"], 1)

    async def test_active_lease_prevents_premature_recovery(self):
        claim = await self.enqueue({"lote_id": "lote-activo", "polygon": []})
        envelope = json.loads(claim.envelope_raw)
        envelope["claimed_at"] = time.time() - 30
        stale_raw = json.dumps(envelope, separators=(",", ":"))
        self.redis.lists[self.queue.processing_name][0] = stale_raw

        recovered = await self.queue.recover_abandoned()

        self.assertEqual(recovered, 0)
        self.assertEqual(
            self.redis.lists[self.queue.processing_name], [stale_raw]
        )

    async def test_backend_post_failure_is_not_acknowledged(self):
        claim = await self.enqueue({"lote_id": "lote-5", "polygon": []})
        backend_failure = AsyncMock(
            side_effect=TransientTaskError(
                "POST backend fallido", code="backend_delivery_failed"
            )
        )

        result = await self.queue.execute(claim, backend_failure)

        self.assertEqual(result.outcome, "retry")
        self.assertEqual(result.error_code, "backend_delivery_failed")
        self.assertEqual(self.redis.lists[self.queue.processing_name], [])
        self.assertEqual(len(self.redis.zsets[self.queue.retry_name]), 1)

    async def test_lost_lease_cancels_processor_without_ack_retry_or_dlq(self):
        claim = await self.enqueue({"lote_id": "lote-lease", "polygon": []})
        cancelled = asyncio.Event()

        async def slow_processor(_task):
            try:
                await asyncio.sleep(30)
            finally:
                cancelled.set()

        with patch.object(
            self.queue,
            "_heartbeat_loop",
            AsyncMock(side_effect=QueueLeaseLostError("lease perdido")),
        ):
            with self.assertRaises(QueueLeaseLostError):
                await self.queue.execute(claim, slow_processor)

        self.assertTrue(cancelled.is_set())
        self.assertEqual(len(self.redis.lists[self.queue.processing_name]), 1)
        self.assertEqual(len(self.redis.zsets[self.queue.retry_name]), 0)
        self.assertEqual(len(self.redis.lists[self.queue.dlq_name]), 0)

    async def test_retry_exhaustion_ends_in_dlq(self):
        claim = await self.enqueue(
            {
                "lote_id": "lote-6",
                "polygon": [],
                "_queue": {"attempt": 3},
            }
        )

        result = await self.queue.execute(
            claim,
            AsyncMock(
                side_effect=TransientTaskError(
                    "Servicio caido", code="service_unavailable"
                )
            ),
        )

        self.assertEqual(result.outcome, "dlq")
        self.assertEqual(result.attempt, 3)
        self.assertEqual(len(self.redis.lists[self.queue.dlq_name]), 1)

    async def test_invalid_json_is_quarantined_in_dlq(self):
        await self.redis.lpush("tareas-ndvi", "{json-invalido")
        claim = await self.queue.claim()

        result = await self.queue.execute(claim, AsyncMock())

        self.assertEqual(result.outcome, "dlq")
        entry = json.loads(self.redis.lists[self.queue.dlq_name][0])
        self.assertEqual(entry["error_code"], "invalid_json")
        self.assertIsNone(entry["task"])

    async def test_dedupe_release_failure_does_not_undo_terminal_ack(self):
        claim = await self.enqueue(
            {
                "lote_id": "lote-release",
                "polygon": [],
                "dedupe_key": "ndvi-task:lote-release:latest:normal",
                "dedupe_token": "token-release",
            }
        )
        release = AsyncMock(side_effect=RuntimeError("redis temporal"))

        result = await self.queue.execute(claim, AsyncMock(), release)

        self.assertEqual(result.outcome, "ack")
        self.assertEqual(self.redis.lists[self.queue.processing_name], [])


if __name__ == "__main__":
    unittest.main()
