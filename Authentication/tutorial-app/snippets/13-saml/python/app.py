import os
import time
from collections.abc import Callable
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Form
from fastapi.responses import JSONResponse, RedirectResponse, Response

from ids import ExpiringIds
from saml import EXAMPLE_SETTINGS, Settings, authn_request, metadata, new_id, redirect_url
from validate import CLOCK_SKEW, SamlError, validate_response

REQUEST_LIFETIME = 10 * 60  # seconds we wait for the IdP to answer an AuthnRequest


def create_app(settings: Settings, now: Callable[[], float] = time.time) -> FastAPI:
    app = FastAPI()
    pending = ExpiringIds(now)  # AuthnRequest IDs we sent and have not had an answer to
    used = ExpiringIds(now)  # assertion IDs we already accepted: the replay cache
    users: dict[str, dict] = {}  # keyed by IdP + NameID; a real app uses a database table
    app.state.users = users

    @app.get("/saml/metadata")
    def sp_metadata():
        return Response(metadata(settings), media_type="application/samlmetadata+xml")

    # SP-initiated sign-in: remember the request's ID, then send the browser to the IdP with the request in the URL.
    @app.get("/saml/login")
    def login():
        request_id = new_id()
        pending.add(request_id, now() + REQUEST_LIFETIME)
        return RedirectResponse(redirect_url(settings, authn_request(settings, request_id, now())), status_code=302)

    # The Assertion Consumer Service: the IdP's page makes the browser POST the signed response here.
    @app.post("/saml/acs")
    def acs(saml_response: Annotated[str | None, Form(alias="SAMLResponse")] = None):
        if not saml_response:
            return JSONResponse({"error": "Missing SAMLResponse."}, status_code=400)
        try:
            login = validate_response(saml_response, settings, now())
            # One-time use: a stolen or replayed response is refused even while it is still within its time window.
            if used.has(login.assertion_id):
                raise SamlError(401, "This assertion was already used.")
            # It must answer a request we sent (and only once). This also refuses IdP-initiated, unsolicited responses.
            if not pending.take(login.in_response_to):
                raise SamlError(401, "InResponseTo does not match a pending request.")
            used.add(login.assertion_id, login.not_on_or_after + CLOCK_SKEW)
        except SamlError as e:
            return JSONResponse({"error": e.message}, status_code=e.status)

        # Map the assertion to a local user. Key it by issuer + NameID, not by email: emails change and get reused.
        user = {
            "nameId": login.name_id,
            "email": (login.attributes.get("email") or [login.name_id])[0],
            "name": (login.attributes.get("name") or [""])[0],
            "groups": login.attributes.get("groups", []),
        }
        users[f"{settings.idp_entity_id} {login.name_id}"] = user
        # A real app now starts a session (chapter 05) and redirects; this one shows who signed in.
        return user

    return app


def from_env() -> FastAPI:
    """For uvicorn --factory. IDP_CERT is the IdP's signing certificate (PEM), saved from its metadata."""
    cert_file = os.environ.get("IDP_CERT")
    if not cert_file:
        raise SystemExit("Set IDP_CERT to the path of the identity provider's signing certificate (PEM).")
    return create_app(Settings(**EXAMPLE_SETTINGS, idp_cert=Path(cert_file).read_text()))
