"""Starts the API over mutual TLS: python server.py (PORT and CERTS_DIR are optional)."""
import os
import tempfile
from pathlib import Path

import uvicorn

from app import create_app
from pki import create_lab_certificates
from tls import mtls_config, server_context

if __name__ == "__main__":
    # Certificates live in a temporary folder (made on first start), never in the project.
    certs = Path(os.environ.get("CERTS_DIR") or Path(tempfile.gettempdir()) / "auth-lab-mtls")
    create_lab_certificates(certs)
    context = server_context(certs / "ca.crt", certs / "server.crt", certs / "server.key.pem")
    port = int(os.environ.get("PORT", "3000"))
    print(f"Listening on https://localhost:{port} (certificates in {certs})", flush=True)
    uvicorn.Server(mtls_config(create_app(), context, host="127.0.0.1", port=port, log_level="warning")).run()
