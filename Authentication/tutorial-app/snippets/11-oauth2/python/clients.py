"""The clients this authorization server knows. A real server keeps them in a database, registered by an admin."""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Client:
    id: str
    scopes: list[str]
    grants: list[str]
    # Compared as exact strings: no prefixes, no wildcards.
    redirect_uris: list[str] = field(default_factory=list)
    # SHA-256 of the client secret (hex). Public clients, which cannot keep a secret, have none.
    secret_hash: str | None = None


CLIENTS = [
    # A single-page or mobile app acting for a user. It is public, so PKCE protects its codes instead of a secret.
    Client(
        id="photo-app",
        redirect_uris=["http://localhost:4000/callback"],
        scopes=["photos.read"],
        grants=["authorization_code"],
    ),
    # A second public app. The tests use it to show that a code works only for the client it was issued to.
    Client(
        id="album-app",
        redirect_uris=["http://localhost:4002/callback"],
        scopes=["photos.read"],
        grants=["authorization_code"],
    ),
    # A back-end job calling the API as itself. It is confidential: it proves who it is with a secret.
    # This is SHA-256 of the test secret "report-job-secret" that the tests and the curl session use.
    Client(
        id="report-job",
        secret_hash="5a6109c0796d5c2d3b378a951cd14803866a434eadf8964eda1d246a0091c35b",
        scopes=["reports.read"],
        grants=["client_credentials"],
    ),
]


def find_client(client_id: str) -> Client | None:
    return next((c for c in CLIENTS if c.id == client_id), None)
