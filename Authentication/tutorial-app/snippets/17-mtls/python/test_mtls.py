import socket
import ssl
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
import uvicorn
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.x509.oid import NameOID

from app import create_app
from pki import create_lab_certificates, issue
from tls import mtls_config, server_context


@pytest.fixture(scope="module")
def certs():
    """A fresh CA, server and client certificates for this run, in a temporary folder that is deleted afterwards.
    (pytest's own tmp_path folders are kept after the run, private keys and all.)"""
    with tempfile.TemporaryDirectory(prefix="mtls-test-") as name:
        folder = Path(name)
        create_lab_certificates(folder)
        issue(folder, "ca", "renewed", "billing-service", "client")  # the same client's next certificate
        now = datetime.now(timezone.utc)
        issue(folder, "ca", "expired", "billing-service", "client",
              not_before=now - timedelta(minutes=3), not_after=now - timedelta(minutes=1))
        issue(folder, "ca", "server-only", "billing-service", "server")  # our CA and a registered name, but made for servers
        issue(folder, "ca", "no-cn", "billing-service", "client",  # the name, but not as a CN
              subject=x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, "billing-service")]))
        yield folder


@pytest.fixture(scope="module")
def base_url(certs):
    """The real server, TLS and all, on a free port in a background thread. (TestClient skips TLS entirely.)"""
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    context = server_context(certs / "ca.crt", certs / "server.crt", certs / "server.key.pem")
    server = uvicorn.Server(mtls_config(create_app(), context, log_level="warning", lifespan="off"))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.01)
    yield f"https://127.0.0.1:{sock.getsockname()[1]}"
    server.should_exit = True
    thread.join()


def whoami(base_url, certs, identity=None):
    """GET /whoami as a client that trusts our CA for the server, optionally presenting one of the lab's certificates."""
    context = ssl.create_default_context(cafile=certs / "ca.crt")
    if identity:
        context.load_cert_chain(certs / f"{identity}.crt", certs / f"{identity}.key.pem")
    return httpx.get(f"{base_url}/whoami", verify=context)


def assert_refused_in_handshake(base_url, certs, identity=None):
    """The server ends the handshake with a TLS alert or by closing the connection. With TLS 1.3 the client has
    already sent its last handshake message, so it notices on its first read. (A server that is not running at all
    gives ConnectError instead, so this cannot pass by accident.)"""
    with pytest.raises((httpx.ReadError, httpx.RemoteProtocolError)):
        whoami(base_url, certs, identity)


def fingerprint(certs, name):
    return x509.load_pem_x509_certificate((certs / f"{name}.crt").read_bytes()).fingerprint(hashes.SHA256()).hex()


def test_a_client_with_a_certificate_from_our_ca_is_identified(base_url, certs):
    r = whoami(base_url, certs, "client")
    assert r.status_code == 200
    assert r.json() == {"client": "billing-service", "scopes": ["invoices:read"], "fingerprint": fingerprint(certs, "client")}


def test_a_client_without_a_certificate_is_refused_during_the_handshake(base_url, certs):
    assert_refused_in_handshake(base_url, certs)


def test_a_certificate_from_another_ca_is_refused_even_with_a_registered_name(base_url, certs):
    assert_refused_in_handshake(base_url, certs, "stranger")


def test_an_expired_certificate_from_our_ca_is_refused(base_url, certs):
    assert_refused_in_handshake(base_url, certs, "expired")


def test_a_certificate_made_for_servers_not_clients_is_refused(base_url, certs):
    # Our CA and a registered name, but its extended key usage says serverAuth only.
    assert_refused_in_handshake(base_url, certs, "server-only")


def test_a_valid_certificate_that_is_not_registered_gets_403(base_url, certs):
    r = whoami(base_url, certs, "unknown")
    assert r.status_code == 403
    assert r.json() == {"error": "Unknown client certificate."}


def test_a_certificate_without_a_common_name_gets_403(base_url, certs):
    # O=billing-service is not CN=billing-service. Some APIs fall back to other fields when there is no CN; here no CN
    # (or more than one) means an unknown client.
    r = whoami(base_url, certs, "no-cn")
    assert r.status_code == 403
    assert r.json() == {"error": "Unknown client certificate."}


def test_a_renewed_certificate_for_the_same_client_is_accepted(base_url, certs):
    r = whoami(base_url, certs, "renewed")
    assert r.status_code == 200
    assert r.json()["client"] == "billing-service"
    assert fingerprint(certs, "renewed") != fingerprint(certs, "client")
    assert r.json()["fingerprint"] == fingerprint(certs, "renewed")
