import json
import time
from collections.abc import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from receiver import WebhookVerifier


def _refuse(constant: str):
    raise ValueError(f"{constant} is not JSON")  # json.loads accepts NaN and Infinity unless told not to


def create_app(secrets: list[str], now: Callable[[], float] = time.time) -> FastAPI:
    app = FastAPI()
    verifier = WebhookVerifier(secrets, now)
    received: list[dict] = []  # a real receiver puts events on a queue and answers at once
    app.state.received = received

    # No Pydantic body parameter here: FastAPI would parse the JSON first. Read the exact bytes that were signed.
    @app.post("/webhooks/orders")
    async def orders_webhook(request: Request):
        body = await request.body()
        if rejection := verifier.verify(request.headers.get("webhook-signature"), body):
            return JSONResponse({"error": rejection.error}, status_code=rejection.status)

        # Only now, with a genuine body, parse it: strict UTF-8 and strict JSON, as in Node.js and .NET.
        try:
            event = json.loads(body.decode("utf-8"), parse_constant=_refuse)
        except ValueError:  # also covers UnicodeDecodeError and json.JSONDecodeError
            event = None
        if not isinstance(event, dict):
            return JSONResponse({"error": "Body is not a JSON object."}, status_code=400)
        received.append(event)
        return {"received": True, "type": event.get("type")}

    return app
