import base64
import math
import os
import re
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from recovery_codes import RecoveryCode, hash_recovery_codes, new_recovery_codes, use_recovery_code
from secret_box import SecretBox
from totp import base32_encode, new_totp_secret, otpauth_uri, verify_totp

ISSUER = "Auth Lab"  # the name the authenticator app shows above the code
PENDING_SECONDS = 5 * 60  # time allowed between the password and the code
MAX_CODE_FAILURES = 5
LOCK_SECONDS = 15 * 60
# The first factor, as in chapter 04: Argon2id with OWASP's minimum settings. Recovery codes reuse them.
HASHER = PasswordHasher(memory_cost=19_456, time_cost=2, parallelism=1)


@dataclass
class User:
    email: str
    password_hash: str
    totp_secret: str | None = None  # encrypted; set once enrolment is confirmed
    pending_totp_secret: str | None = None  # encrypted; between /mfa/setup and /mfa/confirm
    last_totp_step: int = -1  # the last 30-second step used, so a code works once
    recovery_codes: list[RecoveryCode] | None = None  # one salted hash per unused code
    code_failures: int = 0
    locked_until: float = 0.0
    # Endpoints run on a thread pool: this lock lets one request per user run each check-then-update step.
    # A database does this with a transaction or a conditional UPDATE.
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)


@dataclass
class Pending:
    email: str
    expires_at: float


class Credentials(BaseModel):
    email: str
    password: str


class MfaLogin(BaseModel):
    pendingToken: str
    code: str


class Code(BaseModel):
    code: str


INVALID = {"error": "Email or password is incorrect."}
BAD_CODE = {"error": "That code is not valid."}
SIGN_IN_FIRST = {"error": "Sign in first."}
SIGN_IN_AGAIN = {"error": "Sign in again."}


def create_app(encryption_key: bytes, now: Callable[[], float] = time.time, hasher: PasswordHasher = HASHER) -> FastAPI:
    app = FastAPI()
    box = SecretBox(encryption_key)
    users: dict[str, User] = {}  # a real app uses a database table
    sessions: dict[str, str] = {}  # session token -> email (chapter 05 does sessions properly)
    pending: dict[str, Pending] = {}  # password checked, code not yet
    dummy_hash = hasher.hash("not-a-real-password")
    app.state.users = users

    def password_ok(password: str, stored: str) -> bool:
        try:
            return hasher.verify(stored, password)
        except (VerificationError, InvalidHashError):
            return False

    def start_session(email: str) -> str:
        token = secrets.token_urlsafe(32)
        sessions[token] = email
        return token

    def signed_in(request: Request) -> User | None:
        """The user for "Authorization: Bearer <session token>", or None."""
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        email = sessions.get(token)
        return users[email] if email else None

    @app.post("/signup", status_code=201)
    def signup(body: Credentials):
        email = body.email.strip().lower()
        if "@" not in email or len(body.password) < 12:
            return JSONResponse({"error": "Enter an email and a password of at least 12 characters."}, status_code=400)
        if email in users:
            return JSONResponse({"error": "That email is already registered."}, status_code=409)
        users[email] = User(email, hasher.hash(body.password))
        return {"email": email}

    # Step 1 of sign-in: the password. With MFA on, this proves only the first factor, so it returns a short-lived
    # pending token that is good for nothing except step 2.
    @app.post("/login")
    def login(body: Credentials):
        email = body.email.strip().lower()
        user = users.get(email)
        ok = password_ok(body.password, user.password_hash if user else dummy_hash)
        if user is None or not ok:
            return JSONResponse(INVALID, status_code=401)
        if user.totp_secret is None:
            return {"token": start_session(email)}
        pending_token = secrets.token_urlsafe(32)
        pending[pending_token] = Pending(email, now() + PENDING_SECONDS)
        return {"mfaRequired": True, "pendingToken": pending_token}

    # Step 2: a code from the authenticator app, or a recovery code.
    @app.post("/login/mfa")
    def login_mfa(body: MfaLogin):
        sign_in = pending.get(body.pendingToken)
        if sign_in is None:
            return JSONResponse(SIGN_IN_AGAIN, status_code=401)
        user = users[sign_in.email]
        with user.lock:
            # Checked inside the lock: a request for the same user that held it just before may have used this token.
            if pending.get(body.pendingToken) is not sign_in or sign_in.expires_at <= now():
                pending.pop(body.pendingToken, None)
                return JSONResponse(SIGN_IN_AGAIN, status_code=401)
            if (wait := user.locked_until - now()) > 0:
                return JSONResponse(
                    {"error": "Too many wrong codes. Try again later."},
                    status_code=429,
                    headers={"Retry-After": str(math.ceil(wait))},
                )

            code = "".join(body.code.split())
            ok, recovery_codes_left = False, None
            if re.fullmatch(r"[0-9]{6}", code):
                step = verify_totp(box.open(user.totp_secret, user.email), code, now(), user.last_totp_step)
                if step is not None:
                    user.last_totp_step = step  # this code, and every older one, is now used up
                    ok = True
            elif use_recovery_code(user.recovery_codes, code, hasher):
                ok, recovery_codes_left = True, len(user.recovery_codes)

            if not ok:
                user.code_failures += 1
                if user.code_failures >= MAX_CODE_FAILURES:
                    user.locked_until = now() + LOCK_SECONDS  # a 6-digit code must not be guessable by brute force
                    user.code_failures = 0
                return JSONResponse(BAD_CODE, status_code=401)
            user.code_failures = 0
            del pending[body.pendingToken]  # a pending token works once
        token = start_session(user.email)
        if recovery_codes_left is None:
            return {"token": token}
        return {"token": token, "recoveryCodesLeft": recovery_codes_left}

    # Enrolment, part 1: make a secret and show it as a QR code (the otpauth URI) and as text to type in.
    @app.post("/mfa/setup")
    def mfa_setup(request: Request):
        if (user := signed_in(request)) is None:
            return JSONResponse(SIGN_IN_FIRST, status_code=401)
        with user.lock:
            if user.totp_secret is not None:
                return JSONResponse({"error": "Two-factor sign-in is already on."}, status_code=409)
            secret = new_totp_secret()
            user.pending_totp_secret = box.seal(secret, user.email)  # not active until confirmed
        secret_base32 = base32_encode(secret)
        return {"secret": secret_base32, "otpauthUri": otpauth_uri(secret_base32, user.email, ISSUER)}

    # Enrolment, part 2: a first valid code proves the app holds the secret. Only then is MFA turned on.
    @app.post("/mfa/confirm")
    def mfa_confirm(body: Code, request: Request):
        if (user := signed_in(request)) is None:
            return JSONResponse(SIGN_IN_FIRST, status_code=401)
        with user.lock:
            if user.pending_totp_secret is None:
                return JSONResponse({"error": "Start set-up first."}, status_code=400)
            step = verify_totp(box.open(user.pending_totp_secret, user.email), body.code, now(), user.last_totp_step)
            if step is None:
                return JSONResponse(BAD_CODE, status_code=400)
            codes = new_recovery_codes()
            user.last_totp_step = step  # the confirming code cannot be used again
            user.recovery_codes = hash_recovery_codes(codes, hasher)
            user.totp_secret, user.pending_totp_secret = user.pending_totp_secret, None
        return {"recoveryCodes": codes}  # shown once; only hashes are kept

    @app.get("/me")
    def me(request: Request):
        if (user := signed_in(request)) is None:
            return JSONResponse(SIGN_IN_FIRST, status_code=401)
        return {"email": user.email, "mfa": user.totp_secret is not None}

    return app


def _key_from_config() -> bytes:
    """The key that encrypts TOTP secrets comes from configuration (in production, a key vault): 32 bytes, base64.
    Without one, a random key is made at start-up, so enrolments last only until the server stops."""
    if configured := os.environ.get("MFA_ENCRYPTION_KEY"):
        return base64.b64decode(configured)
    print("MFA_ENCRYPTION_KEY is not set: using a random key for this run only.")
    return os.urandom(32)


app = create_app(_key_from_config())
