import re

from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import create_app
from soft_authenticator import SoftAuthenticator, b64url

clock = [1_792_238_400.0]  # 2026-10-17 12:00 UTC
app = create_app(rp_id="localhost", origin="http://localhost:3000", now=lambda: clock[0])
client = TestClient(app)
store = app.state.store


def options(path: str, body: dict | None = None) -> dict:
    return client.post(path, json=body or {}).json()


def register(username: str, auth: SoftAuthenticator | None = None):
    """Registers a new account with a passkey made by `auth`."""
    auth = auth or SoftAuthenticator()
    res = client.post("/webauthn/register/verify", json=auth.register(options("/webauthn/register/options", {"username": username})))
    return auth, res


def login(auth: SoftAuthenticator, **tamper):
    return client.post("/webauthn/login/verify", json=auth.login(options("/webauthn/login/options"), **tamper))


def test_registration_options_ask_for_a_discoverable_passkey_with_user_verification():
    res = client.post("/webauthn/register/options", json={"username": "Ada@Example.com"})
    assert res.status_code == 200
    opts = res.json()
    assert opts["rp"]["id"] == "localhost"
    assert opts["user"]["name"] == "ada@example.com"
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", opts["challenge"])  # 32 random bytes, base64url
    assert opts["authenticatorSelection"]["residentKey"] == "required"
    assert opts["authenticatorSelection"]["userVerification"] == "required"
    assert any(p["alg"] == -7 for p in opts["pubKeyCredParams"]), "offers ES256"
    assert options("/webauthn/register/options", {"username": "x@example.com"})["challenge"] != opts["challenge"]


def test_register_a_passkey_then_sign_in_with_it():
    auth, res = register("ada@example.com")
    assert res.status_code == 201
    body = res.json()
    assert body == {"username": "ada@example.com", "credentialId": b64url(auth.credential_id), "deviceType": "singleDevice", "backedUp": False}
    stored = store.credentials[body["credentialId"]]
    assert stored.counter == 0
    assert stored.transports == ["hybrid", "internal"]
    assert stored.public_key[0] == 0xA5, "a COSE key: a CBOR map of five entries"

    res = login(auth)
    assert res.status_code == 200
    assert res.json() == {"username": "ada@example.com", "message": "Signed in."}
    assert stored.counter == 1, "the new sign count is saved"


def test_a_username_can_be_registered_only_once():
    register("bo@example.com")
    again = client.post("/webauthn/register/options", json={"username": "bo@example.com"})
    assert again.status_code == 409
    assert again.json() == {"error": "That username is already registered."}


def test_a_synced_passkey_reports_its_backup_state_and_a_sign_count_of_zero():
    auth, res = register("cy@example.com", SoftAuthenticator(synced=True))
    body = res.json()
    assert (body["deviceType"], body["backedUp"]) == ("multiDevice", True)
    for _ in range(2):
        assert login(auth).status_code == 200, "a counter that stays at 0 is allowed"
    assert store.credentials[body["credentialId"]].counter == 0


def test_a_credential_can_be_registered_only_once():
    auth, res = register("lu@example.com")
    assert res.status_code == 201
    again = client.post("/webauthn/register/verify", json=auth.register(options("/webauthn/register/options", {"username": "mo@example.com"})))
    assert again.status_code == 400
    assert again.json() == {"error": "Registration failed."}
    assert store.find_user_by_name("mo@example.com") is None, "no account was made"


def test_a_response_from_another_origin_is_rejected_phishing():
    opts = options("/webauthn/register/options", {"username": "di@example.com"})
    phished = SoftAuthenticator().register(opts, origin="https://login.example.com.evil.example")
    assert client.post("/webauthn/register/verify", json=phished).status_code == 400

    auth, _ = register("di@example.com")
    res = login(auth, origin="https://evil.example")
    assert res.status_code == 401
    assert res.json() == {"error": "Passkey sign-in failed."}


def test_a_response_for_another_rp_id_is_rejected():
    auth, _ = register("ed@example.com")
    assert login(auth, rp_id="evil.example").status_code == 401


def test_a_challenge_the_server_never_issued_is_rejected():
    auth, _ = register("fay@example.com")
    res = login(auth, challenge=b64url(bytes([7] * 32)))
    assert res.status_code == 400
    assert res.json() == {"error": "Unknown or expired challenge."}


def test_a_challenge_can_be_used_only_once():
    auth = SoftAuthenticator()
    registration = auth.register(options("/webauthn/register/options", {"username": "gus@example.com"}))
    assert client.post("/webauthn/register/verify", json=registration).status_code == 201
    assert client.post("/webauthn/register/verify", json=registration).status_code == 400

    assertion = auth.login(options("/webauthn/login/options"))
    assert client.post("/webauthn/login/verify", json=assertion).status_code == 200
    replay = client.post("/webauthn/login/verify", json=assertion)
    assert replay.status_code == 400
    assert replay.json() == {"error": "Unknown or expired challenge."}


def test_a_challenge_works_only_for_the_ceremony_it_was_issued_for():
    auth, _ = register("pat@example.com")
    registration = options("/webauthn/register/options", {"username": "quin@example.com"})
    res = client.post("/webauthn/login/verify", json=auth.login({"challenge": registration["challenge"], "rpId": "localhost"}))
    assert res.status_code == 400
    assert res.json() == {"error": "Unknown or expired challenge."}

    challenge = options("/webauthn/login/options")["challenge"]
    res = client.post("/webauthn/register/verify", json=SoftAuthenticator().register({**registration, "challenge": challenge}))
    assert res.status_code == 400


def test_a_challenge_expires_after_five_minutes():
    auth, _ = register("hal@example.com")
    opts = options("/webauthn/login/options")
    clock[0] += 5 * 60
    assert client.post("/webauthn/login/verify", json=auth.login(opts)).status_code == 400


def test_a_sign_count_that_does_not_increase_is_rejected_a_cloned_authenticator():
    auth, _ = register("ivy@example.com")
    assert login(auth).status_code == 200  # count 1
    for sign_count in (1, 0):
        assert login(auth, sign_count=sign_count).status_code == 401, f"count {sign_count} after 1"


def test_user_presence_and_user_verification_are_required():
    for tamper in ({"up": False}, {"uv": False}):
        opts = options("/webauthn/register/options", {"username": "jo@example.com"})
        assert client.post("/webauthn/register/verify", json=SoftAuthenticator().register(opts, **tamper)).status_code == 400
    auth, _ = register("jo@example.com")
    for tamper in ({"up": False}, {"uv": False}):
        assert login(auth, **tamper).status_code == 401


def test_the_user_handle_must_be_the_credential_owners():
    auth, _ = register("nia@example.com")
    register("oz@example.com")
    oz = store.find_user_by_name("oz@example.com")
    res = login(auth, user_handle=oz.id)
    assert res.status_code == 401
    assert res.json() == {"error": "Passkey sign-in failed."}


def test_a_device_bound_passkey_cannot_turn_into_a_synced_one():
    auth, _ = register("rex@example.com")
    assert login(auth, synced=True).status_code == 401
    assert login(auth).status_code == 200, "the real flags still work"


def test_a_signature_from_another_key_is_rejected():
    auth, _ = register("kim@example.com")
    assert login(auth, sign_with=ec.generate_private_key(ec.SECP256R1())).status_code == 401


def test_the_demo_page_is_served_at_the_root():
    res = client.get("/")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")
    assert "navigator.credentials.create" in res.text
    assert "navigator.credentials.get" in res.text
