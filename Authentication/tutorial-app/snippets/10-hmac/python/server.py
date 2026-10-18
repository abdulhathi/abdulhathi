"""Runs the receiver: ../../.venv/bin/python -m uvicorn server:app --port 3000"""
import os

from app import create_app
from sender import new_secret

# Active secrets, comma-separated, newest first: WEBHOOK_SECRETS=whsec_new,whsec_old while you rotate.
secrets = [s.strip() for s in os.environ.get("WEBHOOK_SECRETS", "").split(",") if s.strip()]
if not secrets:
    secrets = [new_secret()]
    print(f"No WEBHOOK_SECRETS set. This run uses: {secrets[0]}", flush=True)
app = create_app(secrets)
