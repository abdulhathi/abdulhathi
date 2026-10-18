import json
import os
import secrets
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI
from fastapi.responses import FileResponse, JSONResponse
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url, options_to_json_dict
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    CredentialDeviceType,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from store import Challenges, Credential, Store, User

# EdDSA, ES256 and RS256: between them, every authenticator in use today.
ALGORITHMS = [
    COSEAlgorithmIdentifier.EDDSA,
    COSEAlgorithmIdentifier.ECDSA_SHA_256,
    COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
]
TIMEOUT_MS = 5 * 60 * 1000
EXPIRED = {"error": "Unknown or expired challenge."}
FAILED = {"error": "Passkey sign-in failed."}
TAKEN = {"error": "That username is already registered."}
DEMO_PAGE = Path(__file__).parent / "static" / "index.html"


def device_type_of(device_type: CredentialDeviceType) -> str:
    """The library's enum as the JSON value the other two projects use."""
    return "multiDevice" if device_type == CredentialDeviceType.MULTI_DEVICE else "singleDevice"


def challenge_of(body: dict[str, Any]) -> str:
    """The challenge the browser wrote into clientDataJSON: it tells us which ceremony this response answers."""
    try:
        return str(json.loads(base64url_to_bytes(body["response"]["clientDataJSON"]))["challenge"])
    except Exception:
        return ""


def create_app(
    rp_id: str = "localhost",
    rp_name: str = "Auth Lab",
    origin: str = "http://localhost:3000",
    now: Callable[[], float] = time.time,
) -> FastAPI:
    app = FastAPI()
    store = Store()
    challenges = Challenges(now)
    app.state.store = store

    @app.get("/", include_in_schema=False)
    def demo_page():
        return FileResponse(DEMO_PAGE)

    # Ceremony 1, registration: create a new account with a passkey.
    @app.post("/webauthn/register/options")
    def register_options(body: dict[str, Any] = Body(default={})):
        username = str(body.get("username", "")).strip().lower()
        if not username:
            return JSONResponse({"error": "Enter a username."}, status_code=400)
        if store.find_user_by_name(username):
            return JSONResponse(TAKEN, status_code=409)
        user = User(id=bytes_to_base64url(secrets.token_bytes(16)), username=username)  # saved only on success
        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=rp_name,
            user_name=username,
            user_display_name=username,
            user_id=base64url_to_bytes(user.id),
            challenge=secrets.token_bytes(32),
            timeout=TIMEOUT_MS,
            # A passkey: a discoverable credential (stored on the authenticator) unlocked by biometrics or a PIN.
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                require_resident_key=True,
                user_verification=UserVerificationRequirement.REQUIRED,
            ),
            supported_pub_key_algs=ALGORITHMS,
        )
        challenges.remember(bytes_to_base64url(options.challenge), "registration", user)
        return options_to_json_dict(options)

    @app.post("/webauthn/register/verify", status_code=201)
    def register_verify(body: dict[str, Any] = Body(default={})):
        challenge = challenge_of(body)
        pending = challenges.take(challenge, "registration")
        if pending is None or pending.user is None:
            return JSONResponse(EXPIRED, status_code=400)
        user = pending.user
        try:
            # Checks the type, challenge, origin, RP ID hash, user presence and verification flags, and the key algorithm.
            info = verify_registration_response(
                credential=body,
                expected_challenge=base64url_to_bytes(challenge),
                expected_rp_id=rp_id,
                expected_origin=origin,
                require_user_verification=True,
                supported_pub_key_algs=ALGORITHMS,
            )
        except WebAuthnException:
            return JSONResponse({"error": "Registration failed."}, status_code=400)
        credential_id = bytes_to_base64url(info.credential_id)
        if credential_id in store.credentials:
            return JSONResponse({"error": "Registration failed."}, status_code=400)
        if store.find_user_by_name(user.username):
            return JSONResponse(TAKEN, status_code=409)
        device_type = device_type_of(info.credential_device_type)
        store.users[user.id] = user
        store.credentials[credential_id] = Credential(
            id=credential_id,
            user_id=user.id,
            public_key=info.credential_public_key,
            counter=info.sign_count,
            transports=[str(t) for t in body["response"].get("transports", [])],  # reported by the browser
            device_type=device_type,
            backed_up=info.credential_backed_up,
        )
        return {"username": user.username, "credentialId": credential_id, "deviceType": device_type, "backedUp": info.credential_backed_up}

    # Ceremony 2, authentication: no username needed; the browser offers the passkeys it holds for this RP ID.
    @app.post("/webauthn/login/options")
    def login_options():
        options = generate_authentication_options(
            rp_id=rp_id,
            challenge=secrets.token_bytes(32),
            timeout=TIMEOUT_MS,
            user_verification=UserVerificationRequirement.REQUIRED,
        )
        challenges.remember(bytes_to_base64url(options.challenge), "authentication")
        return options_to_json_dict(options)

    @app.post("/webauthn/login/verify")
    def login_verify(body: dict[str, Any] = Body(default={})):
        challenge = challenge_of(body)
        if challenges.take(challenge, "authentication") is None:
            return JSONResponse(EXPIRED, status_code=400)
        credential = store.credentials.get(str(body.get("id")))
        # The user handle is the user ID the passkey was made for: it must be the account that owns this credential.
        if credential is None or body["response"].get("userHandle") != credential.user_id:
            return JSONResponse(FAILED, status_code=401)
        try:
            # Checks the type, challenge, origin, RP ID hash and flags, then the signature over
            # authenticatorData || SHA-256(clientDataJSON) with the stored public key, and the signature counter
            # (it must go up, unless the stored and the new count are both 0, as synced passkeys report).
            info = verify_authentication_response(
                credential=body,
                expected_challenge=base64url_to_bytes(challenge),
                expected_rp_id=rp_id,
                expected_origin=origin,
                credential_public_key=credential.public_key,
                credential_current_sign_count=credential.counter,
                require_user_verification=True,
            )
        except WebAuthnException:
            return JSONResponse(FAILED, status_code=401)
        # Backup eligibility (the BE flag) is fixed when a credential is made (WebAuthn Level 3, section 7.2): a
        # device-bound passkey that now claims to be synced, or the reverse, is not the credential we registered.
        if device_type_of(info.credential_device_type) != credential.device_type:
            return JSONResponse(FAILED, status_code=401)
        credential.counter = info.new_sign_count
        credential.backed_up = info.credential_backed_up
        # A real app starts a session here (chapter 05) or issues tokens (chapter 08).
        return {"username": store.users[credential.user_id].username, "message": "Signed in."}

    return app


# The RP ID is the site's domain; the origin is the exact scheme, host and port the browser shows.
# Browsers allow WebAuthn on http://localhost; everywhere else it needs HTTPS.
app = create_app(
    rp_id=os.environ.get("RP_ID", "localhost"),
    origin=os.environ.get("ORIGIN", "http://localhost:3000"),
)
