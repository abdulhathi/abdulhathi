import base64
import copy

from fastapi.testclient import TestClient
from lxml import etree

from app import create_app
from fake_idp import FakeIdp, authn_request_from
from saml import EXAMPLE_SETTINGS, NS, Settings

# The tests play the IdP: they hold its private key, and the app trusts only its certificate.
clock = [1_792_238_400.0]  # 2026-10-17 12:00 UTC
idp = FakeIdp(clock[0])
other_idp = FakeIdp(clock[0], "attacker.example.com")
app = create_app(Settings(**EXAMPLE_SETTINGS, idp_cert=idp.cert_pem), now=lambda: clock[0])
client = TestClient(app)
users = app.state.users


def start_login() -> str:
    """Starts a sign-in at the SP and returns the ID of the AuthnRequest it sent."""
    r = client.get("/saml/login", follow_redirects=False)
    return authn_request_from(r.headers["location"]).get("ID")


def respond(signer: FakeIdp = idp, **options) -> str:
    """What the IdP sends back for a fresh sign-in, signed by the IdP unless another key is given."""
    return signer.signed_response(**{"in_response_to": start_login(), "now": clock[0], **options})


def post(xml: str):
    """The browser's auto-submitted form: SAMLResponse is the Base64 of the XML."""
    return client.post("/saml/acs", data={"SAMLResponse": base64.b64encode(xml.encode()).decode()})


def assert_refused(xml: str, error: str):
    r = post(xml)
    assert r.status_code == 401
    assert r.json() == {"error": error}


def test_a_valid_response_signs_the_user_in_mapped_from_name_id_and_attributes():
    r = post(respond())
    assert r.status_code == 200
    user = {"nameId": "ada@example.com", "email": "ada@example.com", "name": "Ada Lovelace", "groups": ["engineering"]}
    assert r.json() == user
    assert users["https://idp.example.com/saml ada@example.com"] == user


def test_a_response_signed_with_another_key_is_refused():
    assert_refused(respond(other_idp), "Invalid signature.")


def test_changing_a_signed_attribute_breaks_the_signature():
    xml = respond()
    tampered = xml.replace(
        "<saml:AttributeValue>engineering</saml:AttributeValue>", "<saml:AttributeValue>admins</saml:AttributeValue>"
    )
    assert tampered != xml
    assert_refused(tampered, "Invalid signature.")


def test_an_assertion_signed_with_sha1_is_refused_even_with_the_right_key():
    assert_refused(respond(sha1=True), "Invalid signature.")


def test_an_assertion_from_another_issuer_is_refused():
    assert_refused(respond(issuer="https://other-idp.example.com/saml"), "Wrong issuer.")


def test_an_assertion_for_another_service_provider_is_refused():
    assert_refused(respond(audience="https://other-sp.example.com/saml/metadata"), "Wrong audience.")


def test_a_response_for_another_acs_url_is_refused():
    assert_refused(respond(recipient="https://other-sp.example.com/saml/acs"), "Wrong recipient.")


def test_an_expired_assertion_is_refused():
    xml = respond()  # valid for 5 minutes
    clock[0] += 10 * 60
    assert_refused(xml, "The assertion has expired.")


def test_an_assertion_that_is_not_valid_yet_is_refused():
    # Issued five minutes ahead of our clock: more than the one minute of skew we allow.
    assert_refused(respond(now=clock[0] + 5 * 60), "The assertion is not valid yet.")


def test_the_same_assertion_cannot_be_used_twice():
    xml = respond()
    assert post(xml).status_code == 200
    assert_refused(xml, "This assertion was already used.")


def test_a_response_to_a_request_the_sp_never_sent_is_refused():
    xml = idp.signed_response(in_response_to="_never-sent", now=clock[0])
    assert_refused(xml, "InResponseTo does not match a pending request.")


def test_a_wrapped_assertion_is_refused():
    # The attacker has a real, signed assertion for their own account. They add a forged copy for someone else in
    # front of it. The signature still verifies (it covers the original), and a naive SP reads the first assertion.
    root = etree.fromstring(respond(name_id="mallory@example.com").encode())
    signed = root.find("saml:Assertion", NS)
    forged = copy.deepcopy(signed)
    forged.set("ID", "_forged")
    forged.remove(forged.find("ds:Signature", NS))
    forged.find("saml:Subject/saml:NameID", NS).text = "admin@example.com"
    signed.addprevious(forged)
    assert_refused(etree.tostring(root).decode(), "The response must contain exactly one assertion.")


def test_a_signed_assertion_hidden_inside_the_signature_is_refused():
    # A deeper variant: the forged assertion takes the signed one's place and carries its signature, and the signed
    # assertion moves into a ds:Object inside that signature. The reference still finds it there, so the signature
    # verifies. Counting every Assertion at any depth, not only the Response's children, stops it.
    root = etree.fromstring(respond(name_id="mallory@example.com").encode())
    signed = root.find("saml:Assertion", NS)
    forged = copy.deepcopy(signed)
    forged.set("ID", "_forged")
    forged.find("saml:Subject/saml:NameID", NS).text = "admin@example.com"
    root.replace(signed, forged)
    signed.remove(signed.find("ds:Signature", NS))  # the enveloped transform removed it anyway
    etree.SubElement(forged.find("ds:Signature", NS), f"{{{NS['ds']}}}Object").append(signed)
    assert_refused(etree.tostring(root).decode(), "The response must contain exactly one assertion.")


def test_a_response_with_a_dtd_is_refused_before_anything_else():
    # An external entity would make a careless parser read a file from the server into the NameID (XXE).
    xml = (
        respond()
        .replace("<samlp:Response", '<!DOCTYPE samlp:Response [<!ENTITY name SYSTEM "file:///etc/passwd">]><samlp:Response')
        .replace(">ada@example.com</saml:NameID>", ">&name;</saml:NameID>")
    )
    r = post(xml)
    assert r.status_code == 400
    assert r.json() == {"error": "Malformed SAML response."}


def test_a_comment_inside_the_name_id_cannot_shorten_it():
    # Canonicalization drops comments, so the signature still verifies. A reader that takes only the first text node
    # (lxml's .text on the original document) would see "ada@example.com"; reading what was signed gives the whole value.
    xml = respond(name_id="ada@example.com.evil.example")
    injected = xml.replace(">ada@example.com.evil.example</saml:NameID>", ">ada@example.com<!---->.evil.example</saml:NameID>")
    assert injected != xml
    r = post(injected)
    assert r.status_code == 200
    assert r.json()["nameId"] == "ada@example.com.evil.example"
