from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.x509.oid import NameOID
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# Registered clients: the certificate's subject common name, and what that client may do.
KNOWN_CLIENTS = {"billing-service": ["invoices:read"]}


def create_app(clients: dict[str, list[str]] = KNOWN_CLIENTS) -> FastAPI:
    app = FastAPI()

    # Who is calling was settled in the TLS handshake, before any HTTP arrived. Here we only map it to a client.
    @app.middleware("http")
    async def identify_client(request: Request, call_next):
        tls = request.scope.get("extensions", {}).get("tls") or {}
        chain = tls.get("client_cert_chain") or []
        # CERT_REQUIRED already refused missing and untrusted certificates. Checking again costs nothing and still
        # protects the app if it is ever served without client authentication.
        if not chain or tls.get("client_cert_error"):
            return JSONResponse({"error": "A valid client certificate is required."}, status_code=401)
        cert = x509.load_pem_x509_certificate(chain[0].encode())
        cns = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
        name = cns[0].value if len(cns) == 1 else ""  # a certificate with several CNs is ambiguous: treat it as unknown
        scopes = clients.get(name)
        # Signed by our CA but not registered: we know it is genuine, we just have not agreed to serve it.
        if scopes is None:
            return JSONResponse({"error": "Unknown client certificate."}, status_code=403)
        # The SHA-256 fingerprint of the certificate (its DER bytes) names this exact certificate; RFC 8705 binds tokens to it.
        request.state.caller = {"client": name, "scopes": scopes, "fingerprint": cert.fingerprint(hashes.SHA256()).hex()}
        return await call_next(request)

    @app.get("/whoami")
    def whoami(request: Request):
        return request.state.caller

    return app
