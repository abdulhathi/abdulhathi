"""A key ring for RS256.

The newest key signs new tokens; older keys stay published, so the tokens they signed still verify, until they are
retired. Keys are generated at start-up and never written to disk: a real issuer keeps its private keys in a key vault
or HSM.
"""
import hashlib
import json
import threading
from dataclasses import dataclass

from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.utils import base64url_encode, to_base64url_uint

ALG = "RS256"


@dataclass(frozen=True)
class SigningKey:
    kid: str
    private_key: rsa.RSAPrivateKey
    public_jwk: dict

    @property
    def public_key(self) -> rsa.RSAPublicKey:
        return self.private_key.public_key()


def thumbprint(n: str, e: str) -> str:
    """The RFC 7638 thumbprint of an RSA public key: a SHA-256 of its required members, sorted, without spaces."""
    canonical = json.dumps({"e": e, "kty": "RSA", "n": n}, separators=(",", ":"), sort_keys=True)
    return base64url_encode(hashlib.sha256(canonical.encode()).digest()).decode()


def new_signing_key() -> SigningKey:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = private_key.public_key().public_numbers()
    n, e = to_base64url_uint(numbers.n).decode(), to_base64url_uint(numbers.e).decode()
    kid = thumbprint(n, e)  # the key ID is the key's thumbprint, so it can never clash
    return SigningKey(kid, private_key, {"kty": "RSA", "use": "sig", "alg": ALG, "kid": kid, "n": n, "e": e})


class KeyRing:
    def __init__(self) -> None:
        self._keys = [new_signing_key()]
        self._lock = threading.Lock()

    @property
    def current(self) -> SigningKey:
        """The key that signs new tokens: the newest one."""
        return self._keys[-1]

    def find(self, kid: str | None) -> SigningKey | None:
        """The key with this ID, or None if the ring never had it or has retired it."""
        return next((k for k in self._keys if k.kid == kid), None)

    def rotate(self) -> SigningKey:
        """Start signing with a new key. Older keys keep verifying the tokens they already signed."""
        key = new_signing_key()
        with self._lock:
            self._keys = [*self._keys, key]
        return key

    def retire(self, kid: str) -> None:
        """Stop trusting a key. Do this once every token it signed has expired."""
        with self._lock:
            self._keys = [k for k in self._keys if k.kid != kid]

    def jwks(self) -> dict:
        """The JSON Web Key Set served at /.well-known/jwks.json: public keys only."""
        return {"keys": [k.public_jwk for k in self._keys]}
