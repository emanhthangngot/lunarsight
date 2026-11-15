"""Shared non-waiting admission, bounded caches and bounded HTTP bodies."""
from __future__ import annotations

from collections import OrderedDict
from contextlib import contextmanager
import json
from pathlib import Path
import threading
from contextvars import ContextVar
from contextvars import copy_context
from collections.abc import Callable, Iterator
from pydantic import BaseModel
import time
from typing import Generic, TypeVar

import requests

T = TypeVar("T", bound=BaseModel)

CACHE_DISK_BYTES = 32 * 1024 * 1024
CACHE_OBJECT_BYTES = 8 * 1024 * 1024
CACHE_DISK_ENTRIES = 64
CACHE_MEMORY_ENTRIES = 16


class CapacityError(RuntimeError):
    """A request exceeds an explicit runtime/storage budget."""



class WorkCancelled(RuntimeError):
    """Work stopped at a cooperative cancellation/deadline checkpoint."""


_work_state: ContextVar[tuple[threading.Event, float] | None] = ContextVar("work_state", default=None)


@contextmanager
def work_scope(cancelled: threading.Event, timeout_s: float = 90) -> Iterator[None]:
    token = _work_state.set((cancelled, time.monotonic() + timeout_s))
    try:
        checkpoint()
        yield
    finally:
        _work_state.reset(token)


def checkpoint() -> None:
    state = _work_state.get()
    if state is not None:
        event, deadline = state
        if event.is_set():
            raise WorkCancelled("Cancelled by submitting client")
        if time.monotonic() > deadline:
            raise WorkCancelled("Analysis exceeded its 90 second work deadline")


class Admission:
    def __init__(self, limit: int) -> None:
        self._slots = threading.BoundedSemaphore(limit)

    @contextmanager
    def enter(self) -> Iterator[None]:
        if not self._slots.acquire(blocking=False):
            raise CapacityError("Scientific request capacity exhausted; retry later")
        try:
            yield
        finally:
            self._slots.release()


class JsonCache(Generic[T]):
    """At most 16 in-memory / 64 disk objects and 32 MiB disk bytes per cache."""

    def __init__(self, directory: Path, model: type[T]) -> None:
        self.directory = directory
        self.model = model
        self._memory: OrderedDict[str, T] = OrderedDict()
        self._lock = threading.Lock()
        directory.mkdir(parents=True, exist_ok=True)
        with self._lock:
            self._trim()

    def _trim(self) -> None:
        paths = sorted(self.directory.glob("*.json"), key=lambda p: p.stat().st_mtime_ns)
        total = sum(p.stat().st_size for p in paths)
        while paths and (len(paths) > CACHE_DISK_ENTRIES or total > CACHE_DISK_BYTES):
            path = paths.pop(0)
            total -= path.stat().st_size
            path.unlink()

    def get(self, key: str) -> T | None:
        with self._lock:
            if key in self._memory:
                self._memory.move_to_end(key)
                return self._memory[key].model_copy(deep=True)
            path = self.directory / f"{key}.json"
            if not path.exists():
                return None
            if path.stat().st_size > CACHE_OBJECT_BYTES:
                path.unlink()
                return None
            try:
                value = self.model.model_validate_json(path.read_bytes())
            except ValueError:
                path.unlink()
                return None
            self._remember(key, value)
            return value.model_copy(deep=True)

    def _remember(self, key: str, value: T) -> None:
        self._memory[key] = value
        self._memory.move_to_end(key)
        while len(self._memory) > CACHE_MEMORY_ENTRIES:
            self._memory.popitem(last=False)

    def put(self, key: str, value: T) -> None:
        payload = value.model_dump_json().encode()
        if len(payload) > CACHE_OBJECT_BYTES:
            raise CapacityError("Cache object exceeds 8 MiB")
        with self._lock:
            path = self.directory / f"{key}.json"
            path.write_bytes(payload)
            self._trim()
            self._remember(key, value.model_copy(deep=True))


def bounded_json_response(response: requests.Response, deadline: float, max_bytes: int) -> object:
    """Read streamed bodies with an absolute budget checked at every chunk.

    The transport has a separate <=5 s read timeout, bounding a stalled chunk
    beyond the deadline. No unbounded response.json() allocation on network input.
    """
    try:
        response.raise_for_status()
        chunks = bytearray()
        for chunk in response.iter_content(chunk_size=16_384):
            checkpoint()
            if time.monotonic() > deadline:
                raise TimeoutError("Upstream total response deadline exceeded")
            if len(chunks) + len(chunk) > max_bytes:
                raise ValueError("Upstream response exceeds byte limit")
            chunks.extend(chunk)
        if time.monotonic() > deadline:
            raise TimeoutError("Upstream total response deadline exceeded")
        return json.loads(chunks)
    finally:
        response.close()


class BoundedHttp:
    """Finite caller deadlines even during OS DNS; abandoned I/O keeps its slot.

    Daemon workers never mutate caches/storage. A hung transport cannot accumulate
    threads or keep process shutdown alive; its slot is not dishonestly recycled.
    """

    def __init__(self, limit: int) -> None:
        self._slots = threading.BoundedSemaphore(limit)

    def request(
        self, call: Callable[..., requests.Response], url: str, *,
        timeout_s: float, max_bytes: int, **kwargs: object,
    ) -> object:
        checkpoint()
        if not self._slots.acquire(blocking=False):
            raise CapacityError("Upstream transport capacity exhausted")
        done = threading.Event()
        outcome: list[object] = []
        deadline = time.monotonic() + timeout_s
        context = copy_context()

        def fetch() -> None:
            try:
                response = call(
                    url, stream=True, allow_redirects=False,
                    timeout=(min(5.0, timeout_s), min(5.0, timeout_s)), **kwargs,
                )
                outcome.append(bounded_json_response(response, deadline, max_bytes))
            except Exception as exc:
                outcome.append(exc)
            finally:
                self._slots.release()
                done.set()

        try:
            threading.Thread(target=context.run, args=(fetch,), daemon=True, name="ls-upstream").start()
        except RuntimeError:
            self._slots.release()
            raise CapacityError("Upstream worker unavailable") from None
        while True:
            checkpoint()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Upstream caller deadline exceeded; I/O slot remains occupied until transport exits")
            if done.wait(min(0.05, remaining)):
                value = outcome[0]
                if isinstance(value, Exception):
                    raise value
                return value
