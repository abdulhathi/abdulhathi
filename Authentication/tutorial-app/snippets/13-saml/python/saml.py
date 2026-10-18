"""SAML 2.0 names, the service provider's settings, and the two documents it sends out: the AuthnRequest and its
metadata. The IdP's values come from the IdP's metadata; yours go into the IdP's configuration for your app."""
import base64
import secrets
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode

PROTOCOL = "urn:oasis:names:tc:SAML:2.0:protocol"  # samlp: messages (AuthnRequest, Response)
ASSERTION = "urn:oasis:names:tc:SAML:2.0:assertion"  # saml: the signed statement about the user
METADATA = "urn:oasis:names:tc:SAML:2.0:metadata"  # md: who is who, and at which URLs
DSIG = "http://www.w3.org/2000/09/xmldsig#"  # ds: XML Signature
NS = {"samlp": PROTOCOL, "saml": ASSERTION, "md": METADATA, "ds": DSIG}

POST_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
EMAIL_FORMAT = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
SUCCESS = "urn:oasis:names:tc:SAML:2.0:status:Success"
BEARER = "urn:oasis:names:tc:SAML:2.0:cm:bearer"


@dataclass(frozen=True)
class Settings:
    sp_entity_id: str  # who we are: the Audience the IdP must name in every assertion meant for us
    acs_url: str  # where the IdP posts responses: the Destination and Recipient it must use
    idp_entity_id: str  # the only Issuer we accept
    idp_sso_url: str  # where we send the browser to sign in
    idp_cert: str  # the IdP's signing certificate (PEM), from its metadata, never from the message


EXAMPLE_SETTINGS = {
    "sp_entity_id": "https://sp.example.com/saml/metadata",
    "acs_url": "https://sp.example.com/saml/acs",
    "idp_entity_id": "https://idp.example.com/saml",
    "idp_sso_url": "https://idp.example.com/saml/sso",
}


def new_id() -> str:
    """A SAML ID is an XML name, so it must not start with a digit: "_" and 160 random bits."""
    return "_" + secrets.token_hex(20)


def instant(t: float) -> str:
    """SAML times are UTC xs:dateTime values: 2026-10-17T12:00:00Z."""
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def authn_request(s: Settings, request_id: str, now: float) -> str:
    return (
        f'<samlp:AuthnRequest xmlns:samlp="{PROTOCOL}" xmlns:saml="{ASSERTION}" ID="{request_id}" Version="2.0" '
        f'IssueInstant="{instant(now)}" Destination="{s.idp_sso_url}" AssertionConsumerServiceURL="{s.acs_url}" '
        f'ProtocolBinding="{POST_BINDING}">'
        f"<saml:Issuer>{s.sp_entity_id}</saml:Issuer>"
        f'<samlp:NameIDPolicy Format="{EMAIL_FORMAT}" AllowCreate="true"/>'
        f"</samlp:AuthnRequest>"
    )


def redirect_url(s: Settings, request_xml: str) -> str:
    """HTTP-Redirect binding: raw DEFLATE, then Base64, then URL-encode it as the SAMLRequest query parameter."""
    deflater = zlib.compressobj(wbits=-15)  # negative wbits: raw DEFLATE, no zlib header or checksum
    deflated = deflater.compress(request_xml.encode()) + deflater.flush()
    return s.idp_sso_url + "?" + urlencode({"SAMLRequest": base64.b64encode(deflated).decode()})


def metadata(s: Settings) -> str:
    """What the IdP's administrator needs to register this service provider."""
    return "\n".join([
        f'<md:EntityDescriptor xmlns:md="{METADATA}" entityID="{s.sp_entity_id}">',
        f'  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="{PROTOCOL}">',
        f"    <md:NameIDFormat>{EMAIL_FORMAT}</md:NameIDFormat>",
        f'    <md:AssertionConsumerService Binding="{POST_BINDING}" Location="{s.acs_url}" index="0" isDefault="true"/>',
        "  </md:SPSSODescriptor>",
        "</md:EntityDescriptor>",
    ])
