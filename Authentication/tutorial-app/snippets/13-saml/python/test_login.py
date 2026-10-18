import re

from fastapi.testclient import TestClient

from app import create_app
from fake_idp import FakeIdp, authn_request_from
from saml import EXAMPLE_SETTINGS, NS, POST_BINDING, Settings

NOW = 1_792_238_400.0  # 2026-10-17 12:00 UTC
idp = FakeIdp(NOW)
client = TestClient(create_app(Settings(**EXAMPLE_SETTINGS, idp_cert=idp.cert_pem), now=lambda: NOW))


def test_login_redirects_to_the_idp_with_a_deflated_authn_request():
    r = client.get("/saml/login", follow_redirects=False)
    assert r.status_code == 302
    location = r.headers["location"]
    assert location.startswith("https://idp.example.com/saml/sso?SAMLRequest=")
    request = authn_request_from(location)
    assert request.tag == f"{{{NS['samlp']}}}AuthnRequest"
    assert re.fullmatch(r"_[0-9a-f]{40}", request.get("ID"))
    assert request.get("IssueInstant") == "2026-10-17T12:00:00Z"
    assert request.get("AssertionConsumerServiceURL") == "https://sp.example.com/saml/acs"
    assert request.get("ProtocolBinding") == POST_BINDING
    assert request.find("saml:Issuer", NS).text == "https://sp.example.com/saml/metadata"


def test_metadata_publishes_the_entity_id_and_the_acs_url():
    r = client.get("/saml/metadata")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/samlmetadata+xml")
    assert 'entityID="https://sp.example.com/saml/metadata"' in r.text
    assert f'Binding="{POST_BINDING}" Location="https://sp.example.com/saml/acs"' in r.text
