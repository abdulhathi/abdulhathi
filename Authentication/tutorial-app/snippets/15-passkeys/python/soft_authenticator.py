"""A software authenticator for the tests: it does what a phone, laptop or security key does, in one short file.

It makes an EC P-256 key pair, builds clientDataJSON (what the browser adds), authenticatorData (what the
authenticator signs) and a "none" attestation object in CBOR, and signs assertions with the private key.
"""
import base64
import hashlib
import json
import secrets
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

# --- A tiny CBOR encoder (RFC 8949): unsigned and negative integers, byte strings, text strings and maps. ---
Cbor = int | str | bytes | dict


def _head(major: int, n: int) -> bytes:
    if n < 24:
        return bytes([major << 5 | n])
    if n < 0x100:
        return bytes([major << 5 | 24, n])
    if n < 0x10000:
        return bytes([major << 5 | 25]) + n.to_bytes(2, "big")
    return bytes([major << 5 | 26]) + n.to_bytes(4, "big")


def cbor(value: Cbor) -> bytes:
    if isinstance(value, int):
        return _head(0, value) if value >= 0 else _head(1, -1 - value)
    if isinstance(value, str):
        data = value.encode()
        return _head(3, len(data)) + data
    if isinstance(value, bytes):
        return _head(2, len(value)) + value
    return _head(5, len(value)) + b"".join(cbor(k) + cbor(v) for k, v in value.items())


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


# authenticatorData flags (WebAuthn Level 3, section 6.1)
UP = 0x01  # user present: someone touched or confirmed
UV = 0x04  # user verified: biometrics or PIN
BE = 0x08  # backup eligible: a synced passkey
BS = 0x10  # backup state: it is backed up now
AT = 0x40  # attested credential data follows


class SoftAuthenticator:
    """Pass keyword arguments to change one thing and make a response the server must reject: origin, rp_id,
    challenge, up=False, uv=False, synced (set or clear the backup flags), sign_count, user_handle, sign_with."""

    def __init__(self, origin: str = "http://localhost:3000", synced: bool = False) -> None:
        self.credential_id = secrets.token_bytes(16)
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        self.sign_count = 0
        self.synced = synced  # synced passkeys set BE and BS and always report a sign count of 0
        self.origin = origin
        self.user_handle = ""

    def register(self, options: dict[str, Any], **tamper: Any) -> dict[str, Any]:
        """What navigator.credentials.create() returns, as JSON."""
        self.user_handle = options["user"]["id"]  # a discoverable credential remembers which account it belongs to
        client_data = self._client_data("webauthn.create", tamper.get("challenge", options["challenge"]), tamper.get("origin"))
        auth_data = self._auth_data(tamper.get("rp_id", options["rp"]["id"]), AT, 0, tamper, self._attested_credential_data())
        attestation_object = cbor({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": b64url(self.credential_id),
            "rawId": b64url(self.credential_id),
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
            "response": {
                "clientDataJSON": b64url(client_data),
                "attestationObject": b64url(attestation_object),
                "transports": ["hybrid", "internal"],
            },
        }

    def login(self, options: dict[str, Any], **tamper: Any) -> dict[str, Any]:
        """What navigator.credentials.get() returns, as JSON: a signature over authenticatorData || SHA-256(clientDataJSON)."""
        if not self.synced:
            self.sign_count += 1
        client_data = self._client_data("webauthn.get", tamper.get("challenge", options["challenge"]), tamper.get("origin"))
        auth_data = self._auth_data(tamper.get("rp_id", options["rpId"]), 0, tamper.get("sign_count", self.sign_count), tamper)
        key = tamper.get("sign_with", self.private_key)
        signature = key.sign(auth_data + sha256(client_data), ec.ECDSA(hashes.SHA256()))  # DER, as WebAuthn expects
        return {
            "id": b64url(self.credential_id),
            "rawId": b64url(self.credential_id),
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
            "response": {
                "clientDataJSON": b64url(client_data),
                "authenticatorData": b64url(auth_data),
                "signature": b64url(signature),
                "userHandle": tamper.get("user_handle", self.user_handle),
            },
        }

    # The browser writes this, not the page: the page cannot lie about its own origin.
    def _client_data(self, type_: str, challenge: str, origin: str | None) -> bytes:
        return json.dumps({"type": type_, "challenge": challenge, "origin": origin or self.origin, "crossOrigin": False}).encode()

    # rpIdHash (32) | flags (1) | signCount (4, big-endian) | attested credential data (registration only)
    def _auth_data(self, rp_id: str, extra_flags: int, sign_count: int, tamper: dict[str, Any], attested: bytes = b"") -> bytes:
        up, uv, synced = tamper.get("up", True), tamper.get("uv", True), tamper.get("synced", self.synced)
        flags = (UP if up else 0) | (UV if uv else 0) | (BE | BS if synced else 0) | extra_flags
        return sha256(rp_id.encode()) + bytes([flags]) + sign_count.to_bytes(4, "big") + attested

    # AAGUID (16, zeros: "unknown model") | credential ID length (2) | credential ID | public key as a COSE_Key
    def _attested_credential_data(self) -> bytes:
        numbers = self.private_key.public_key().public_numbers()
        cose_key = {
            1: 2,  # kty: EC2
            3: -7,  # alg: ES256
            -1: 1,  # crv: P-256
            -2: numbers.x.to_bytes(32, "big"),  # x
            -3: numbers.y.to_bytes(32, "big"),  # y
        }
        cid = self.credential_id
        return bytes(16) + len(cid).to_bytes(2, "big") + cid + cbor(cose_key)
