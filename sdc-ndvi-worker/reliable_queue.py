"""Cola Redis confiable para tareas NDVI.

Los productores existentes siguen escribiendo JSON con LPUSH sobre la cola
principal. El worker reclama cada payload de forma atomica hacia una lista de
procesamiento, mantiene un lease renovable y solo elimina la tarea luego del
exito completo (incluido el POST al backend).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger(__name__)


class TaskProcessingError(Exception):
    """Error clasificado para decidir retry o DLQ."""

    def __init__(self, message: str, *, code: str, retryable: bool):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class TransientTaskError(TaskProcessingError):
    def __init__(self, message: str, *, code: str = "transient_error"):
        super().__init__(message, code=code, retryable=True)


class PermanentTaskError(TaskProcessingError):
    def __init__(self, message: str, *, code: str = "permanent_error"):
        super().__init__(message, code=code, retryable=False)


class QueueLeaseLostError(RuntimeError):
    """El worker ya no tiene derecho a confirmar ni publicar la tarea."""


@dataclass(frozen=True)
class ClaimedTask:
    envelope_raw: str
    payload_raw: str
    claim_id: str
    claimed_at: float
    worker_id: str
    lease_key: str


@dataclass(frozen=True)
class TaskExecutionResult:
    outcome: str
    attempt: int
    error_code: Optional[str] = None


_CLAIM_SCRIPT = """
-- ndvi:claim
local raw = redis.call('RPOP', KEYS[1])
if not raw then
  return nil
end
local envelope = cjson.encode({
  claim_id = ARGV[1],
  claimed_at = tonumber(ARGV[2]),
  worker_id = ARGV[3],
  payload = raw
})
redis.call('LPUSH', KEYS[2], envelope)
redis.call('SET', KEYS[3], ARGV[3], 'EX', ARGV[4])
return envelope
"""

_ACK_SCRIPT = """
-- ndvi:ack
local removed = redis.call('LREM', KEYS[1], 1, ARGV[1])
if removed > 0 then
  redis.call('DEL', KEYS[2])
end
return removed
"""

_RETRY_SCRIPT = """
-- ndvi:retry
local removed = redis.call('LREM', KEYS[1], 1, ARGV[1])
if removed > 0 then
  redis.call('DEL', KEYS[2])
  redis.call('ZADD', KEYS[3], ARGV[2], ARGV[3])
end
return removed
"""

_DLQ_SCRIPT = """
-- ndvi:dlq
local removed = redis.call('LREM', KEYS[1], 1, ARGV[1])
if removed > 0 then
  redis.call('DEL', KEYS[2])
  redis.call('RPUSH', KEYS[3], ARGV[2])
end
return removed
"""

_RECOVER_SCRIPT = """
-- ndvi:recover
if redis.call('EXISTS', KEYS[3]) == 1 then
  return 0
end
local removed = redis.call('LREM', KEYS[2], 1, ARGV[1])
if removed > 0 then
  redis.call('LPUSH', KEYS[1], ARGV[2])
end
return removed
"""

_PROMOTE_SCRIPT = """
-- ndvi:promote
local due = redis.call(
  'ZRANGEBYSCORE',
  KEYS[1],
  '-inf',
  ARGV[1],
  'LIMIT',
  0,
  ARGV[2]
)
local promoted = 0
for _, member in ipairs(due) do
  if redis.call('ZREM', KEYS[1], member) == 1 then
    local decoded = cjson.decode(member)
    redis.call('LPUSH', KEYS[2], decoded.payload)
    promoted = promoted + 1
  end
end
return promoted
"""

_HEARTBEAT_SCRIPT = """
-- ndvi:heartbeat
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 0
"""

_COMPLETE_SCRIPT = """
-- ndvi:complete
return redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
"""


class ReliableRedisQueue:
    """Implementa entrega al menos una vez sobre listas Redis existentes."""

    def __init__(
        self,
        redis_client,
        queue_name: str,
        *,
        max_attempts: int = 4,
        retry_base_seconds: float = 15.0,
        retry_max_seconds: float = 300.0,
        visibility_timeout_seconds: int = 1800,
        poll_seconds: float = 1.0,
        maintenance_interval_seconds: float = 5.0,
        completed_ttl_seconds: int = 7 * 24 * 60 * 60,
        worker_id: Optional[str] = None,
    ):
        self.redis = redis_client
        self.queue_name = queue_name
        self.processing_name = f"{queue_name}:processing"
        self.retry_name = f"{queue_name}:retry"
        self.dlq_name = f"{queue_name}:dlq"
        self.lease_prefix = f"{queue_name}:lease"
        self.completed_prefix = f"{queue_name}:completed"
        self.max_attempts = max(1, int(max_attempts))
        self.retry_base_seconds = max(0.0, float(retry_base_seconds))
        self.retry_max_seconds = max(
            self.retry_base_seconds, float(retry_max_seconds)
        )
        self.visibility_timeout_seconds = max(
            5, int(visibility_timeout_seconds)
        )
        self.poll_seconds = max(0.05, float(poll_seconds))
        self.maintenance_interval_seconds = max(
            1.0, float(maintenance_interval_seconds)
        )
        self.completed_ttl_seconds = max(60, int(completed_ttl_seconds))
        self.worker_id = worker_id or f"ndvi-worker-{uuid.uuid4().hex[:12]}"
        self._last_maintenance = 0.0

    async def initialize(self) -> None:
        """Recupera abandonadas y promueve reintentos vencidos al arrancar."""
        await self.promote_due_retries()
        await self.recover_abandoned()
        self._last_maintenance = time.time()

    async def claim(self) -> Optional[ClaimedTask]:
        await self._maintenance_if_due()
        claim_id = uuid.uuid4().hex
        lease_key = self._lease_key(claim_id)
        now = time.time()
        raw_envelope = await self.redis.eval(
            _CLAIM_SCRIPT,
            3,
            self.queue_name,
            self.processing_name,
            lease_key,
            claim_id,
            str(now),
            self.worker_id,
            str(self.visibility_timeout_seconds),
        )
        if raw_envelope is None:
            return None
        envelope_raw = self._decode_redis(raw_envelope)
        try:
            envelope = json.loads(envelope_raw)
            payload_raw = str(envelope["payload"])
            return ClaimedTask(
                envelope_raw=envelope_raw,
                payload_raw=payload_raw,
                claim_id=str(envelope["claim_id"]),
                claimed_at=float(envelope["claimed_at"]),
                worker_id=str(envelope["worker_id"]),
                lease_key=lease_key,
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError("Redis devolvio un sobre NDVI invalido") from error

    async def wait_for_work(self) -> None:
        await asyncio.sleep(self.poll_seconds)

    async def execute(
        self,
        claim: ClaimedTask,
        processor: Callable[[dict], Awaitable[Any]],
        release_dedupe: Optional[
            Callable[[Optional[str], Optional[str]], Awaitable[None]]
        ] = None,
    ) -> TaskExecutionResult:
        """Procesa un claim y ejecuta una unica transicion terminal."""
        task_data: Optional[dict] = None
        attempt = 1
        try:
            task_data = self.decode_task(claim.payload_raw)
            attempt = self.task_attempt(task_data)

            if await self._is_completed(task_data):
                await self.ack(claim)
                await self._release_dedupe(task_data, release_dedupe)
                return TaskExecutionResult("deduplicated", attempt)

            await self._run_processor_with_lease(claim, processor, task_data)
        except asyncio.CancelledError:
            raise
        except QueueLeaseLostError:
            # No mover ni confirmar: otro worker puede estar recuperando el claim.
            raise
        except TaskProcessingError as error:
            if error.retryable and attempt < self.max_attempts:
                await self.schedule_retry(claim, task_data, attempt, error)
                return TaskExecutionResult("retry", attempt, error.code)
            await self.move_to_dlq(claim, task_data, attempt, error)
            if isinstance(task_data, dict):
                await self._release_dedupe(task_data, release_dedupe)
            return TaskExecutionResult("dlq", attempt, error.code)
        except Exception as error:
            wrapped = TransientTaskError(
                "Fallo no clasificado durante el procesamiento NDVI",
                code=f"unexpected_{type(error).__name__.lower()}",
            )
            if attempt < self.max_attempts:
                await self.schedule_retry(claim, task_data, attempt, wrapped)
                return TaskExecutionResult("retry", attempt, wrapped.code)
            await self.move_to_dlq(claim, task_data, attempt, wrapped)
            if isinstance(task_data, dict):
                await self._release_dedupe(task_data, release_dedupe)
            return TaskExecutionResult("dlq", attempt, wrapped.code)
        else:
            await self._mark_completed(task_data)
            await self.ack(claim)
            await self._release_dedupe(task_data, release_dedupe)
            return TaskExecutionResult("ack", attempt)

    @staticmethod
    def decode_task(payload_raw: str) -> dict:
        try:
            task_data = json.loads(payload_raw)
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise PermanentTaskError(
                "Payload NDVI no es JSON valido", code="invalid_json"
            ) from error
        if not isinstance(task_data, dict):
            raise PermanentTaskError(
                "Payload NDVI debe ser un objeto JSON", code="invalid_payload_type"
            )
        return task_data

    @staticmethod
    def task_attempt(task_data: Optional[dict]) -> int:
        if not isinstance(task_data, dict):
            return 1
        queue_meta = task_data.get("_queue")
        if not isinstance(queue_meta, dict):
            return 1
        try:
            return max(1, int(queue_meta.get("attempt", 1)))
        except (TypeError, ValueError):
            return 1

    async def ack(self, claim: ClaimedTask) -> None:
        removed = await self.redis.eval(
            _ACK_SCRIPT,
            2,
            self.processing_name,
            claim.lease_key,
            claim.envelope_raw,
        )
        if int(removed or 0) != 1:
            raise RuntimeError(
                f"No se pudo confirmar el claim NDVI {claim.claim_id}"
            )

    async def schedule_retry(
        self,
        claim: ClaimedTask,
        task_data: Optional[dict],
        attempt: int,
        error: TaskProcessingError,
    ) -> None:
        next_attempt = attempt + 1
        delay = min(
            self.retry_max_seconds,
            self.retry_base_seconds * (2 ** max(0, attempt - 1)),
        )
        available_at = time.time() + delay
        retry_payload = self._retry_payload(
            claim, task_data, next_attempt, error, available_at
        )
        retry_member = json.dumps(
            {
                "schedule_id": uuid.uuid4().hex,
                "payload": retry_payload,
                "available_at": available_at,
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        moved = await self.redis.eval(
            _RETRY_SCRIPT,
            3,
            self.processing_name,
            claim.lease_key,
            self.retry_name,
            claim.envelope_raw,
            str(available_at),
            retry_member,
        )
        if int(moved or 0) != 1:
            raise RuntimeError(
                f"No se pudo programar retry del claim NDVI {claim.claim_id}"
            )
        logger.warning(
            "Tarea NDVI programada para retry %s/%s (%s)",
            next_attempt,
            self.max_attempts,
            error.code,
        )

    async def move_to_dlq(
        self,
        claim: ClaimedTask,
        task_data: Optional[dict],
        attempt: int,
        error: TaskProcessingError,
    ) -> None:
        dlq_entry = json.dumps(
            {
                "claim_id": claim.claim_id,
                "failed_at": time.time(),
                "attempt": attempt,
                "error_code": error.code,
                "error_type": type(error).__name__,
                "error": self.safe_error_message(error),
                "task": self._redact_for_storage(task_data)
                if task_data is not None
                else None,
                "payload_sha256": hashlib.sha256(
                    claim.payload_raw.encode("utf-8", errors="replace")
                ).hexdigest(),
            },
            separators=(",", ":"),
            sort_keys=True,
        )
        moved = await self.redis.eval(
            _DLQ_SCRIPT,
            3,
            self.processing_name,
            claim.lease_key,
            self.dlq_name,
            claim.envelope_raw,
            dlq_entry,
        )
        if int(moved or 0) != 1:
            raise RuntimeError(
                f"No se pudo mover a DLQ el claim NDVI {claim.claim_id}"
            )
        logger.error(
            "Tarea NDVI enviada a DLQ tras %s intento(s) (%s)",
            attempt,
            error.code,
        )

    async def promote_due_retries(self, batch_size: int = 100) -> int:
        promoted = await self.redis.eval(
            _PROMOTE_SCRIPT,
            2,
            self.retry_name,
            self.queue_name,
            str(time.time()),
            str(max(1, int(batch_size))),
        )
        return int(promoted or 0)

    async def recover_abandoned(self) -> int:
        """Reencola claims sin lease una vez vencida su ventana de visibilidad."""
        # processing solo contiene tareas actualmente reclamadas, por lo que debe
        # recorrerse completo: truncarlo puede dejar claims antiguos varados.
        raw_items = await self.redis.lrange(self.processing_name, 0, -1)
        recovered = 0
        stale_before = time.time() - self.visibility_timeout_seconds
        for raw_item in raw_items or []:
            envelope_raw = self._decode_redis(raw_item)
            try:
                envelope = json.loads(envelope_raw)
                claim_id = str(envelope["claim_id"])
                claimed_at = float(envelope["claimed_at"])
                payload_raw = str(envelope["payload"])
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                await self._quarantine_malformed_processing(envelope_raw)
                continue
            if claimed_at > stale_before:
                continue
            lease_key = self._lease_key(claim_id)
            if await self.redis.get(lease_key):
                continue
            recovered_payload = self._recovered_payload(payload_raw)
            moved = await self.redis.eval(
                _RECOVER_SCRIPT,
                3,
                self.queue_name,
                self.processing_name,
                lease_key,
                envelope_raw,
                recovered_payload,
            )
            recovered += int(moved or 0)
        if recovered:
            logger.warning("Se recuperaron %s tarea(s) NDVI abandonadas", recovered)
        return recovered

    async def _quarantine_malformed_processing(self, envelope_raw: str) -> None:
        claim = ClaimedTask(
            envelope_raw=envelope_raw,
            payload_raw="",
            claim_id="malformed",
            claimed_at=0,
            worker_id="unknown",
            lease_key=self._lease_key("malformed"),
        )
        await self.move_to_dlq(
            claim,
            None,
            1,
            PermanentTaskError(
                "Sobre de procesamiento invalido",
                code="invalid_processing_envelope",
            ),
        )

    async def _maintenance_if_due(self) -> None:
        now = time.time()
        if now - self._last_maintenance < self.maintenance_interval_seconds:
            return
        await self.promote_due_retries()
        await self.recover_abandoned()
        self._last_maintenance = now

    async def _run_processor_with_lease(
        self,
        claim: ClaimedTask,
        processor: Callable[[dict], Awaitable[Any]],
        task_data: dict,
    ) -> Any:
        """Cancela el flujo si se pierde el lease antes de publicar/confirmar."""
        processor_task = asyncio.ensure_future(processor(task_data))
        heartbeat_task = asyncio.create_task(self._heartbeat_loop(claim))
        try:
            done, _ = await asyncio.wait(
                {processor_task, heartbeat_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if heartbeat_task in done:
                # _heartbeat_loop solo termina por perdida de lease o error Redis.
                await heartbeat_task
                raise QueueLeaseLostError(
                    f"El heartbeat NDVI finalizo para {claim.claim_id}"
                )

            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
            return await processor_task
        finally:
            for task in (processor_task, heartbeat_task):
                if not task.done():
                    task.cancel()
            await asyncio.gather(
                processor_task, heartbeat_task, return_exceptions=True
            )

    async def _heartbeat_loop(self, claim: ClaimedTask) -> None:
        interval = max(
            1.0, min(30.0, self.visibility_timeout_seconds / 3)
        )
        while True:
            await asyncio.sleep(interval)
            try:
                renewed = await self.redis.eval(
                    _HEARTBEAT_SCRIPT,
                    1,
                    claim.lease_key,
                    claim.worker_id,
                    str(self.visibility_timeout_seconds),
                )
            except Exception as error:
                raise QueueLeaseLostError(
                    f"No se pudo renovar el lease NDVI {claim.claim_id}"
                ) from error
            if int(renewed or 0) != 1:
                raise QueueLeaseLostError(
                    f"Se perdio el lease NDVI {claim.claim_id}"
                )
                return

    async def _is_completed(self, task_data: dict) -> bool:
        key = self._completed_key(task_data)
        if not key:
            return False
        return bool(await self.redis.get(key))

    async def _mark_completed(self, task_data: dict) -> None:
        key = self._completed_key(task_data)
        if not key:
            return
        await self.redis.eval(
            _COMPLETE_SCRIPT,
            1,
            key,
            str(self.completed_ttl_seconds),
        )

    @staticmethod
    async def _release_dedupe(
        task_data: dict,
        callback: Optional[
            Callable[[Optional[str], Optional[str]], Awaitable[None]]
        ],
    ) -> None:
        if callback is None:
            return
        try:
            await callback(
                task_data.get("dedupe_key"),
                task_data.get("dedupe_token"),
            )
        except Exception as error:
            # El ACK ya es terminal. Una falla de housekeeping no puede
            # transformar una tarea durable en una tarea perdida.
            logger.warning(
                "No se pudo liberar la reserva dedupe NDVI (%s)",
                type(error).__name__,
            )

    def _completed_key(self, task_data: dict) -> Optional[str]:
        dedupe_key = task_data.get("dedupe_key")
        dedupe_token = task_data.get("dedupe_token")
        if not dedupe_key or not dedupe_token:
            return None
        digest = hashlib.sha256(
            f"{dedupe_key}:{dedupe_token}".encode("utf-8")
        ).hexdigest()
        return f"{self.completed_prefix}:{digest}"

    def _lease_key(self, claim_id: str) -> str:
        return f"{self.lease_prefix}:{claim_id}"

    @staticmethod
    def _retry_payload(
        claim: ClaimedTask,
        task_data: Optional[dict],
        next_attempt: int,
        error: TaskProcessingError,
        available_at: float,
    ) -> str:
        if not isinstance(task_data, dict):
            return claim.payload_raw
        updated = dict(task_data)
        previous_meta = updated.get("_queue")
        queue_meta = dict(previous_meta) if isinstance(previous_meta, dict) else {}
        queue_meta.update(
            {
                "attempt": next_attempt,
                "last_error_code": error.code,
                "retry_available_at": available_at,
            }
        )
        updated["_queue"] = queue_meta
        return json.dumps(updated, separators=(",", ":"), sort_keys=True)

    @staticmethod
    def _recovered_payload(payload_raw: str) -> str:
        try:
            task_data = json.loads(payload_raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            return payload_raw
        if not isinstance(task_data, dict):
            return payload_raw
        updated = dict(task_data)
        previous_meta = updated.get("_queue")
        queue_meta = dict(previous_meta) if isinstance(previous_meta, dict) else {}
        try:
            recoveries = int(queue_meta.get("recoveries", 0)) + 1
        except (TypeError, ValueError):
            recoveries = 1
        queue_meta["recoveries"] = recoveries
        queue_meta["recovered_at"] = time.time()
        updated["_queue"] = queue_meta
        return json.dumps(updated, separators=(",", ":"), sort_keys=True)

    @classmethod
    def safe_error_message(cls, error: BaseException) -> str:
        message = str(error) or type(error).__name__
        message = re.sub(
            r"(?i)(authorization|password|secret|token)(\s*[:=]\s*)[^\s,;]+",
            r"\1\2[REDACTED]",
            message,
        )
        message = re.sub(
            r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+",
            "Bearer [REDACTED]",
            message,
        )
        return message[:300]

    @classmethod
    def _redact_for_storage(cls, value: Any) -> Any:
        if isinstance(value, dict):
            redacted = {}
            for key, item in value.items():
                normalized = str(key).lower()
                if any(
                    sensitive in normalized
                    for sensitive in (
                        "authorization",
                        "password",
                        "secret",
                        "token",
                        "credential",
                    )
                ):
                    redacted[key] = "[REDACTED]"
                else:
                    redacted[key] = cls._redact_for_storage(item)
            return redacted
        if isinstance(value, list):
            return [cls._redact_for_storage(item) for item in value]
        return value

    @staticmethod
    def _decode_redis(value: Any) -> str:
        if isinstance(value, bytes):
            return value.decode("utf-8")
        return str(value)
