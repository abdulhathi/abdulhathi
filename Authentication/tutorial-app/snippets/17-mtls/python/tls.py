"""Serving the FastAPI app over mutual TLS with uvicorn, and handing the verified client certificate to the app."""
import ssl
from pathlib import Path

import uvicorn
from uvicorn.protocols.http.h11_impl import H11Protocol


def server_context(ca: Path, cert: Path, key: Path) -> ssl.SSLContext:
    """A TLS server context that makes every client prove who it is with a certificate signed by `ca`."""
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(cert, key)  # the server's own certificate and key: clients check this, as with any HTTPS site
    context.load_verify_locations(ca)  # the CA (or CAs) whose client certificates we accept; nothing else is trusted
    context.verify_mode = ssl.CERT_REQUIRED  # end the handshake if the client sends no certificate, or one `ca` did not sign
    return context


class ClientCertProtocol(H11Protocol):
    """uvicorn's HTTP/1.1 protocol, plus the ASGI TLS extension: the verified client certificate is put in every
    request's scope as scope["extensions"]["tls"]["client_cert_chain"] (PEM strings, the client's own certificate first).

    uvicorn has no public hook for this, so the class relies on two internal details: asyncio calls connection_made()
    only after the TLS handshake has finished, and H11Protocol reads self.app again for each request. Neither is a
    promise, so pin the uvicorn version (requirements.txt does) and run the tests after every upgrade: if a new version
    changes either detail, the "is identified" test fails with 401 instead of silently letting anyone in."""

    def connection_made(self, transport) -> None:
        super().connection_made(transport)
        ssl_object = transport.get_extra_info("ssl_object")  # the handshake has finished by now
        der = ssl_object.getpeercert(binary_form=True) if ssl_object else None
        tls = {"client_cert_chain": [ssl.DER_cert_to_PEM_cert(der)] if der else [], "client_cert_error": None}
        app = self.app

        async def with_tls(scope, receive, send):
            scope.setdefault("extensions", {})["tls"] = tls
            await app(scope, receive, send)

        self.app = with_tls


def mtls_config(app, context: ssl.SSLContext, **options) -> uvicorn.Config:
    return uvicorn.Config(app, http=ClientCertProtocol, ssl_context_factory=lambda config, default: context, **options)
