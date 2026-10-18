"""Everything a service provider must check in a SAML Response before it believes a word of it.

The checks that need memory (replay, InResponseTo) are in app.py; these need only the message and the clock.
"""
import base64
import binascii
import math
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import NoReturn

from lxml import etree
from signxml import DigestAlgorithm, SignatureConfiguration, SignatureMethod, XMLVerifier

from saml import ASSERTION, BEARER, DSIG, NS, PROTOCOL, SUCCESS, Settings

CLOCK_SKEW = 60  # seconds: tolerate clocks that are up to a minute apart, no more

EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#"
ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"

# The signature must sit inside the assertion that is a direct child of the Response, use RSA-SHA256 (no SHA-1),
# and have exactly one reference.
SIGNATURE = SignatureConfiguration(
    location=f"./{{{ASSERTION}}}Assertion/",
    expect_references=1,
    signature_methods=frozenset({SignatureMethod.RSA_SHA256}),
    digest_algorithms=frozenset({DigestAlgorithm.SHA256}),
)

# No DTDs, no entities, no network: SAML never needs them, and they enable XXE and "billion laughs".
PARSER = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)


class SamlError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def reject(message: str) -> NoReturn:
    raise SamlError(401, message)


@dataclass
class Login:
    """What the assertion says, once every check has passed."""
    assertion_id: str
    in_response_to: str
    not_on_or_after: float
    name_id: str
    attributes: dict[str, list[str]]


def _text(el) -> str:
    return "".join(el.itertext()).strip() if el is not None else ""


def _time(value: str | None) -> float:
    try:
        return datetime.fromisoformat(value).timestamp() if value else math.nan  # NaN when absent
    except ValueError:
        return math.nan


def _parse(xml: bytes):
    try:
        root = etree.fromstring(xml, PARSER)
    except etree.XMLSyntaxError:
        raise SamlError(400, "Malformed SAML response.")
    if root.getroottree().docinfo.doctype or root.tag != f"{{{PROTOCOL}}}Response":
        raise SamlError(400, "Malformed SAML response.")
    return root


def _verified_assertion(xml: bytes, placed, idp_cert: str, now: float):
    """Checks the XML signature on the assertion with the IdP's certificate, and returns the assertion *as it was
    signed*. Reading from the returned element, never from the original document, is what defeats signature wrapping."""
    assertion_id = placed.get("ID")
    signatures = placed.findall("ds:Signature", NS)
    if not assertion_id or len(signatures) != 1:
        reject("Invalid signature.")
    signed_info = signatures[0].find("ds:SignedInfo", NS)
    c14n = signed_info.find("ds:CanonicalizationMethod", NS) if signed_info is not None else None
    references = signed_info.findall("ds:Reference", NS) if signed_info is not None else []
    expected = (
        c14n is not None
        and c14n.get("Algorithm") == EXC_C14N  # exclusive c14n
        and len(references) == 1
        and references[0].get("URI") == f"#{assertion_id}"  # the one reference is this very assertion
        and [t.get("Algorithm") for t in references[0].findall("ds:Transforms/ds:Transform", NS)] == [ENVELOPED, EXC_C14N]
    )
    if not expected:
        reject("Invalid signature.")
    try:
        # x509_cert is the certificate from the IdP's metadata; it overrides any certificate inside the message, which
        # an attacker can choose. signxml also checks the certificate's validity dates against verification_time.
        result = XMLVerifier().verify(
            xml,
            x509_cert=idp_cert,
            id_attribute="ID",
            expect_config=replace(SIGNATURE, verification_time=datetime.fromtimestamp(now, timezone.utc)),
        )
    except Exception:  # a wrong signature value, a broken digest, a reference that resolves twice, ...
        reject("Invalid signature.")
    signed = result.signed_xml  # parsed from the canonical XML the IdP signed: no comments, no signature
    if signed is None or signed.tag != f"{{{ASSERTION}}}Assertion" or signed.get("ID") != assertion_id:
        reject("Invalid signature.")
    return signed


def validate_response(saml_response: str, s: Settings, now: float) -> Login:
    try:
        xml = base64.b64decode(saml_response)
    except (binascii.Error, ValueError):
        raise SamlError(400, "Malformed SAML response.")
    response = _parse(xml)

    # 1. The IdP must report success (a failed sign-in comes back as a Response too).
    status = response.find("samlp:Status/samlp:StatusCode", NS)
    if status is None or status.get("Value") != SUCCESS:
        reject("The identity provider did not report success.")

    # 2. Exactly one assertion in the whole document, directly inside the Response. A second, hidden one is how
    #    signature wrapping works: the signature covers one assertion while a naive reader reads the other.
    found = list(response.iter(f"{{{ASSERTION}}}Assertion", f"{{{ASSERTION}}}EncryptedAssertion"))
    if len(found) != 1 or found[0].getparent() is not response:
        reject("The response must contain exactly one assertion.")

    # 3. The signature, and from here on only what it covers.
    assertion = _verified_assertion(xml, found[0], s.idp_cert, now)

    # 4. Issued by the IdP we trust.
    if _text(assertion.find("saml:Issuer", NS)) != s.idp_entity_id:
        reject("Wrong issuer.")

    # 5. About someone, confirmed by bearer: whoever presents it at the right address, before it expires.
    name_id = _text(assertion.find("saml:Subject/saml:NameID", NS))
    data = assertion.find(f"saml:Subject/saml:SubjectConfirmation[@Method='{BEARER}']/saml:SubjectConfirmationData", NS)
    if not name_id or data is None:
        reject("The assertion has no bearer subject.")

    # 6. Sent to our ACS URL. Compare with your configured public URL, never with the Host header of this request.
    destination = response.get("Destination")
    if data.get("Recipient") != s.acs_url or (destination and destination != s.acs_url):
        reject("Wrong recipient.")

    # 7. Meant for us: every AudienceRestriction must name our entity ID.
    conditions = assertion.find("saml:Conditions", NS)
    restrictions = conditions.findall("saml:AudienceRestriction", NS) if conditions is not None else []
    if not restrictions or not all(
        any(_text(a) == s.sp_entity_id for a in r.findall("saml:Audience", NS)) for r in restrictions
    ):
        reject("Wrong audience.")

    # 8. Inside its validity window, with a little clock skew. The earliest NotOnOrAfter wins; none at all is expired.
    if conditions is not None and now + CLOCK_SKEW < _time(conditions.get("NotBefore")):
        reject("The assertion is not valid yet.")
    ends = [_time(data.get("NotOnOrAfter"))]
    if conditions is not None and conditions.get("NotOnOrAfter"):
        ends.append(_time(conditions.get("NotOnOrAfter")))
    not_on_or_after = min(ends)
    if not (now - CLOCK_SKEW < not_on_or_after):
        reject("The assertion has expired.")

    # 9. An answer to a request: the signed InResponseTo, which the unsigned Response must not contradict.
    in_response_to = data.get("InResponseTo") or ""
    outer = response.get("InResponseTo")
    if not in_response_to or (outer and outer != in_response_to):
        reject("InResponseTo does not match a pending request.")

    attributes = {
        a.get("Name", ""): [_text(v) for v in a.findall("saml:AttributeValue", NS)]
        for a in assertion.findall("saml:AttributeStatement/saml:Attribute", NS)
    }
    return Login(assertion.get("ID"), in_response_to, not_on_or_after, name_id, attributes)
