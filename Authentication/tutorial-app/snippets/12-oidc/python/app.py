"""The relying party: a web app that signs users in with OpenID Connect, using Authlib's Starlette client."""
import os
import secrets

import httpx
from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

from mock_idp import IdpClient, MockIdp

CLIENT_ID = "web-app"
# A test secret. Read a real one from configuration or a vault; never commit it.
CLIENT_SECRET = os.environ.get("CLIENT_SECRET", "web-app-secret")


def create_app(base_url: str = "http://localhost:3000", idp_transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    """idp_transport lets the tests route the relying party's back-channel calls (discovery, JWKS, token,
    UserInfo) into this same app in memory; normally they go over the network."""
    issuer = f"{base_url}/idp"  # a real app reads the provider's issuer URL from configuration
    # The lab's own identity provider, served by this same app under /idp. In production it is Entra ID, Google, ...
    # The hash is SHA-256 of "web-app-secret".
    idp = MockIdp(issuer, [IdpClient(CLIENT_ID, "99b55be79983e9546380ca7d7f1506aef263143451a1e15751f87e103d044371",
                                     [f"{base_url}/callback"], [f"{base_url}/logged-out"])])
    app = FastAPI()
    app.state.idp = idp
    app.state.sign_in_errors = []  # why sign-ins failed: what you would send to your logs
    app.include_router(idp.router(), prefix="/idp")
    # A signed cookie holds the session (Authlib keeps state, nonce and the PKCE verifier there until the callback).
    # Lax: the cookie is sent on the top-level redirect back from the provider.
    app.add_middleware(SessionMiddleware, secret_key=secrets.token_urlsafe(32), session_cookie="sid",
                       same_site="lax", https_only=base_url.startswith("https://"))

    oauth = OAuth()
    oauth.register(
        name="idp",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        server_metadata_url=f"{issuer}/.well-known/openid-configuration",  # discovery
        client_kwargs={
            "scope": "openid profile email",  # with "openid", Authlib adds a nonce
            "code_challenge_method": "S256",  # PKCE
            **({"transport": idp_transport} if idp_transport else {}),
        },
    )

    @app.get("/")
    def home(request: Request):
        user = request.session.get("user")
        return {"signedIn": True, "name": user["name"]} if user else {"signedIn": False}

    @app.get("/login")
    async def login(request: Request):
        # Makes state, nonce and a PKCE verifier, keeps them in the session, and redirects to the provider.
        return await oauth.idp.authorize_redirect(request, f"{base_url}/callback")

    @app.get("/callback")
    async def callback(request: Request):
        try:
            # Checks state, swaps the code (with the PKCE verifier) for tokens, then validates the ID token:
            # signature by kid from the JWKS, exp, iat, nonce and azp. Authlib checks aud only through its azp
            # rule, so require aud explicitly here; any claims_options replace its default iss check, so iss too.
            token = await oauth.idp.authorize_access_token(request, claims_options={
                "iss": {"essential": True, "value": issuer},
                "aud": {"essential": True, "value": CLIENT_ID},
            })
            claims = token["userinfo"]  # Authlib's name for the validated ID token claims
            profile = await oauth.idp.userinfo(token=token)  # the UserInfo endpoint, with the access token
            if profile["sub"] != claims["sub"]:
                raise OAuthError(description="UserInfo sub does not match the ID token.")
        except Exception as e:  # bad state, nonce, signature, issuer, audience or expiry: log it, tell the user little
            app.state.sign_in_errors.append(f"{type(e).__name__}: {e}")
            return JSONResponse({"error": "Sign-in failed."}, status_code=401)
        request.session.clear()  # a fresh session at sign-in
        request.session["user"] = {"sub": claims["sub"], "name": profile["name"], "email": profile["email"]}
        request.session["id_token"] = token["id_token"]
        return RedirectResponse("/me", 302)

    @app.get("/me")
    def me(request: Request):
        user = request.session.get("user")
        return user if user else JSONResponse({"error": "Not signed in."}, status_code=401)

    @app.post("/logout")
    async def logout(request: Request):
        # Ends the local session, then sends the browser to the provider's end_session_endpoint with id_token_hint.
        id_token = request.session.get("id_token")
        request.session.clear()
        return await oauth.idp.logout_redirect(request, post_logout_redirect_uri=f"{base_url}/logged-out", id_token_hint=id_token)

    @app.get("/logged-out")
    async def logged_out(request: Request):
        # The provider sends the browser back here after its own sign-out.
        try:
            await oauth.idp.validate_logout_response(request)  # checks the state Authlib sent
        except OAuthError:
            return JSONResponse({"error": "Sign-out state does not match."}, status_code=400)
        return RedirectResponse("/", 302)

    return app


app = create_app(os.environ.get("BASE_URL", "http://localhost:3000"))
