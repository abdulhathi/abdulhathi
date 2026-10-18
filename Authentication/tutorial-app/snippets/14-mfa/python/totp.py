"""TOTP (RFC 6238) built on HOTP (RFC 4226), written out so you can see every step.

Authenticator apps (Google Authenticator, Microsoft Authenticator, 1Password and the rest) use these settings:
HMAC-SHA1, 30-second steps, 6 digits.
"""
import base64
import hmac
import re
import secrets
import struct
from urllib.parse import quote

STEP_SECONDS = 30
DIGITS = 6


def base32_encode(data: bytes) -> str:
    """Base32 (RFC 4648) without "=" padding: the form an authenticator app expects."""
    return base64.b32encode(data).decode().rstrip("=")


def base32_decode(text: str) -> bytes:
    clean = "".join(text.split()).replace("-", "").replace("=", "").upper()
    return base64.b32decode(clean + "=" * (-len(clean) % 8))


def hotp(secret: bytes, counter: int, digits: int = DIGITS) -> str:
    """HOTP, RFC 4226: an HMAC-SHA1 of an 8-byte counter, cut down to a short number ("dynamic truncation")."""
    mac = hmac.digest(secret, struct.pack(">Q", counter), "sha1")  # 20 bytes; the counter big-endian
    offset = mac[-1] & 0x0F  # the low 4 bits of the last byte say where to read
    binary = struct.unpack(">I", mac[offset : offset + 4])[0] & 0x7FFFFFFF  # 4 bytes from there, top bit cleared
    return str(binary % 10**digits).zfill(digits)


def step_at(seconds: float) -> int:
    """TOTP, RFC 6238: the counter is the number of 30-second steps since 1970."""
    return int(seconds // STEP_SECONDS)


def totp(secret: bytes, seconds: float, digits: int = DIGITS) -> str:
    return hotp(secret, step_at(seconds), digits)


def verify_totp(secret: bytes, code: str, seconds: float, last_used_step: int = -1, window: int = 1) -> int | None:
    """Checks a typed code against the step before, the current step and the step after (phone clocks drift and
    people type slowly), and refuses any step at or before the last one used, so each code works once.

    Returns the step that matched, which the caller saves as the new "last used step", or None.
    """
    typed = "".join(code.split())
    if not re.fullmatch(r"[0-9]{6}", typed):
        return None
    now = step_at(seconds)
    match = None
    for step in range(now - window, now + window + 1):
        # Check every step, comparing in constant time, so the time taken says nothing about which one matched.
        if hmac.compare_digest(typed, hotp(secret, step)) and step > last_used_step:
            match = step
    return match


def new_totp_secret() -> bytes:
    """A new shared secret: 160 random bits, the length RFC 4226 recommends for HMAC-SHA1."""
    return secrets.token_bytes(20)


def otpauth_uri(secret_base32: str, account: str, issuer: str) -> str:
    """The Key URI an authenticator app reads from a QR code."""
    label = f"{quote(issuer, safe='')}:{quote(account, safe='')}"
    query = f"secret={secret_base32}&issuer={quote(issuer, safe='')}&algorithm=SHA1&digits={DIGITS}&period={STEP_SECONDS}"
    return f"otpauth://totp/{label}?{query}"
