"""Encrypts TOTP secrets before they are stored.

The server needs the secret itself to compute codes, so it cannot be hashed like a password; instead it is encrypted
with AES-256-GCM under a key that lives outside the database. Each value gets a fresh 12-byte nonce, and the user's
email is bound in as "associated data", so a secret copied onto another user's row fails to decrypt.
Stored form: v1.<base64url(nonce | ciphertext | 16-byte tag)>. "v1" names the key, so keys can be rotated later.
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NONCE = 12


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


class SecretBox:
    def __init__(self, key: bytes) -> None:
        if len(key) != 32:
            raise ValueError("The encryption key must be 32 bytes (AES-256).")
        self._aes = AESGCM(key)

    def seal(self, plaintext: bytes, associated_data: str) -> str:
        nonce = os.urandom(NONCE)
        sealed = self._aes.encrypt(nonce, plaintext, associated_data.encode())  # ciphertext followed by the tag
        return "v1." + _b64url(nonce + sealed)

    def open(self, stored: str, associated_data: str) -> bytes:
        """Raises if the value, the associated data or the key is not the one it was sealed with."""
        version, _, data = stored.partition(".")
        if version != "v1" or not data:
            raise ValueError("Unknown secret format.")
        raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
        return self._aes.decrypt(raw[:NONCE], raw[NONCE:], associated_data.encode())  # raises InvalidTag
