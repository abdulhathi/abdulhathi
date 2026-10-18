import math
import os
import secrets
import time
from collections.abc import Callable, Iterable

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from magic_links import TTL_SECONDS, MagicLinks
from outbox import Email, Outbox
from rate_limit import RateLimiter

WINDOW_SECONDS = 15 * 60
EMAILS_PER_ADDRESS = 3  # in any 15 minutes
EMAILS_PER_IP = 10
BROWSER_COOKIE = "signin_browser"
SESSION_COOKIE = "session"

CHECK_EMAIL = {"message": "Check your email. If an account exists, a sign-in link and code are on the way."}
BAD_LINK = {"error": "This link is not valid or has expired. Ask for a new one."}
BAD_CODE = {"error": "That code is not valid or has expired."}
TOO_MANY = {"error": "Too many requests. Try again later."}


def email_text(link: str, code: str) -> str:
    return (
        f"Sign in to Auth Lab:\n{link}\n\nOr enter this code: {code}\n\n"
        "The link and the code work once and expire in 15 minutes. If you did not ask for this, ignore this email."
    )


def confirm_page(token: str) -> str:
    """Shown when a link is opened without the cookie of the browser that asked. Scanners and prefetchers fetch links
    but rarely submit forms; never submit it with a script, since some scanners run scripts. The token is one this
    server issued (peek found it), so it is plain base64url and safe to put in the HTML."""
    return f"""<!doctype html>
<meta charset="utf-8">
<title>Sign in</title>
<form method="post" action="/auth/verify">
  <input type="hidden" name="token" value="{token}">
  <button type="submit">Continue signing in</button>
</form>
"""


# Missing fields default to "", so {} gets the same 400 or 401 as in the other stacks rather than FastAPI's 422.
class EmailRequest(BaseModel):
    email: str = ""


class CodeRequest(BaseModel):
    email: str = ""
    code: str = ""


def create_app(
    users: Iterable[str] = ("ada@example.com",),
    outbox: Outbox | None = None,
    base_url: str = "http://localhost:3000",
    now: Callable[[], float] = time.time,
) -> FastAPI:
    app = FastAPI()
    accounts = set(users)  # a real app uses a database table
    outbox = outbox or Outbox()
    links = MagicLinks(now)
    per_email = RateLimiter(EMAILS_PER_ADDRESS, WINDOW_SECONDS, now)
    per_ip = RateLimiter(EMAILS_PER_IP, WINDOW_SECONDS, now)
    sessions: dict[str, str] = {}  # session id -> email (chapter 05 does sessions properly)
    app.state.links, app.state.outbox = links, outbox

    def sign_in(email: str) -> JSONResponse:
        session_id = secrets.token_urlsafe(32)
        sessions[session_id] = email
        response = JSONResponse({"email": email, "message": "Signed in."})
        # Add secure=True when the site is served over HTTPS (always, in production). Chapter 05 covers the flags.
        response.set_cookie(SESSION_COOKIE, session_id, httponly=True, samesite="lax", path="/")
        response.delete_cookie(BROWSER_COOKIE, path="/auth")
        return response

    @app.post("/auth/email")
    def ask_for_email(body: EmailRequest, request: Request):
        email = body.email.strip().lower()
        if "@" not in email:
            return JSONResponse({"error": "Enter a valid email address."}, status_code=400)
        # Limits for unknown emails too, so a 429 says nothing about which accounts exist. Behind a proxy, run uvicorn
        # with --proxy-headers and --forwarded-allow-ips so request.client is the client rather than the proxy.
        ip = request.client.host if request.client else "unknown"
        wait = per_ip.take(ip) or per_email.take(email)
        if wait > 0:
            return JSONResponse(TOO_MANY, status_code=429, headers={"Retry-After": str(math.ceil(wait))})
        response = JSONResponse(CHECK_EMAIL, status_code=202)  # the same answer whether or not the account exists
        # Marks this browser as the one that asked. Set for unknown emails too, so the two answers look the same.
        browser = secrets.token_urlsafe(32)
        response.set_cookie(BROWSER_COOKIE, browser, httponly=True, samesite="lax", path="/auth", max_age=TTL_SECONDS)
        if email in accounts:
            token, code = links.issue(email, browser)
            # The configured base URL, never the request's Host header: an attacker could point the link at their site.
            outbox.send(Email(email, "Your sign-in link", email_text(f"{base_url}/auth/verify?token={token}", code)))
        return response

    @app.get("/auth/verify")
    def open_link(request: Request, token: str = ""):
        pending = links.peek(token)
        if pending is None:
            return JSONResponse(BAD_LINK, status_code=400)
        if not links.same_browser(pending, request.cookies.get(BROWSER_COOKIE)):
            # Another device, a link scanner or an email prefetcher: show a button, and sign in only on the POST.
            # No caching, no Referer with the token in it, and no framing (a framed button can be clicked by trickery).
            headers = {
                "Cache-Control": "no-store",
                "Referrer-Policy": "no-referrer",
                "Content-Security-Policy": "frame-ancestors 'none'",
            }
            return HTMLResponse(confirm_page(token), headers=headers)
        email = links.consume(token)
        if email is None:
            return JSONResponse(BAD_LINK, status_code=400)
        return sign_in(email)  # a real app would redirect to its home page here

    @app.post("/auth/verify")
    def confirm_link(token: str = Form("")):
        email = links.consume(token)
        if email is None:
            return JSONResponse(BAD_LINK, status_code=400)
        return sign_in(email)

    @app.post("/auth/code")
    def enter_code(body: CodeRequest):
        email = body.email.strip().lower()
        if not links.check_code(email, body.code):
            return JSONResponse(BAD_CODE, status_code=401)
        return sign_in(email)

    @app.get("/me")
    def me(request: Request):
        email = sessions.get(request.cookies.get(SESSION_COOKIE, ""))
        if email is None:
            return JSONResponse({"error": "Sign in first."}, status_code=401)
        return {"email": email}

    return app


def _print_email(email: Email) -> None:
    print(f"\n--- Email to {email.to}: {email.subject}\n{email.text}\n---", flush=True)


# Links in emails start with BASE_URL: the public address of the site, set in configuration.
# Emails are printed instead of being sent. Start uvicorn with --no-access-log: its access log prints every request's
# path with the query string, and the query string of a link holds its token.
app = create_app(
    users={"ada@example.com"},
    outbox=Outbox(_print_email),
    base_url=os.environ.get("BASE_URL", "http://localhost:3000"),
)
