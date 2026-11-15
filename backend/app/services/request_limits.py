"""ASGI admission happens before FastAPI's worker-pool queue or body parsing."""
from __future__ import annotations

import threading
import asyncio
import time
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestLimits:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._requests = threading.BoundedSemaphore(16)
        self._science = threading.BoundedSemaphore(4)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if not self._requests.acquire(blocking=False):
            await JSONResponse({"detail": "Request capacity exhausted"}, status_code=429,
                               headers={"Retry-After": "1"})(scope, receive, send)
            return
        scientific = scope["path"] in {
            "/api/coverage/check", "/api/horizon", "/api/ephemeris",
            "/api/terrain/elevation", "/api/terrain/patch",
        }
        admitted = False
        try:
            if scientific:
                admitted = self._science.acquire(blocking=False)
                if not admitted:
                    await JSONResponse({"detail": "Scientific capacity exhausted"}, status_code=429,
                                       headers={"Retry-After": "1"})(scope, receive, send)
                    return
            body = bytearray()
            deadline = time.monotonic() + 10
            while True:
                try:
                    message = await asyncio.wait_for(receive(), max(0.001, deadline - time.monotonic()))
                except TimeoutError:
                    await JSONResponse({"detail": "Request body deadline exceeded"}, status_code=408)(scope, receive, send)
                    return
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                if len(body) + len(chunk) > 65_536:
                    await JSONResponse({"detail": "Request body exceeds 64 KiB"}, status_code=413)(scope, receive, send)
                    return
                body.extend(chunk)
                if not message.get("more_body", False):
                    break
            delivered = False
            async def replay() -> Message:
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()
            await self.app(scope, replay, send)
        finally:
            if admitted:
                self._science.release()
            self._requests.release()
