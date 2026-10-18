"""Runs the API: ../../.venv/bin/python -m uvicorn server:app --port 3000"""
from app import create_app

app = create_app()
# The first admin key, printed once so you can try the API. A real service creates it with a deployment script or
# a command-line tool and puts it straight into a secret store.
_, admin_key = app.state.keys.issue("admin", ["keys:manage"])
print(f"Admin key (shown once): {admin_key}", flush=True)
