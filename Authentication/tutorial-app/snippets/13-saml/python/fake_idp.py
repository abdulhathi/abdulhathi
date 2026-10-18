"""A tiny identity provider for the tests. It makes its own RSA key and self-signed certificate in memory, reads
AuthnRequests, and builds and signs SAML Responses."""
import base64
import zlib
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from xml.sax.saxutils import escape, quoteattr

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from lxml import etree
from signxml import XMLSigner

from saml import ASSERTION, BEARER, EMAIL_FORMAT, EXAMPLE_SETTINGS, NS, PROTOCOL, SUCCESS, instant, new_id


class _OldSigner(XMLSigner):
    """signxml refuses to sign with SHA-1. The tests need such a signature to prove the SP refuses it too."""

    def check_deprecated_methods(self) -> None:
        pass


class FakeIdp:
    def __init__(self, now: float, common_name: str = "idp.example.com") -> None:
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])
        start = datetime.fromtimestamp(now, timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(name)
            .issuer_name(name)  # self-signed: SAML trusts this exact certificate, not a CA
            .public_key(self.key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(start - timedelta(days=1))
            .not_valid_after(start + timedelta(days=365))
            .sign(self.key, hashes.SHA256())
        )
        self.cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
        self.key_pem = self.key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        )

    def response_xml(
        self,
        *,
        in_response_to: str,
        now: float,
        name_id: str = "ada@example.com",
        attributes: dict[str, list[str]] | None = None,
        issuer: str = EXAMPLE_SETTINGS["idp_entity_id"],
        audience: str = EXAMPLE_SETTINGS["sp_entity_id"],
        recipient: str = EXAMPLE_SETTINGS["acs_url"],  # the ACS URL, used for both Destination and Recipient
        lifetime: float = 5 * 60,
    ) -> str:
        attributes = attributes or {"email": [name_id], "name": ["Ada Lovelace"], "groups": ["engineering"]}
        issued, expires = instant(now), instant(now + lifetime)
        attribute_xml = "".join(
            f"<saml:Attribute Name={quoteattr(n)}>"
            + "".join(f"<saml:AttributeValue>{escape(v)}</saml:AttributeValue>" for v in values)
            + "</saml:Attribute>"
            for n, values in attributes.items()
        )
        return (
            f'<samlp:Response xmlns:samlp="{PROTOCOL}" xmlns:saml="{ASSERTION}" ID="{new_id()}" Version="2.0" '
            f'IssueInstant="{issued}" Destination={quoteattr(recipient)} InResponseTo={quoteattr(in_response_to)}>'
            f"<saml:Issuer>{escape(issuer)}</saml:Issuer>"
            f'<samlp:Status><samlp:StatusCode Value="{SUCCESS}"/></samlp:Status>'
            f'<saml:Assertion ID="{new_id()}" Version="2.0" IssueInstant="{issued}">'
            f"<saml:Issuer>{escape(issuer)}</saml:Issuer>"
            # signxml puts the signature where this placeholder is: after the Issuer, as the schema requires.
            f'<ds:Signature xmlns:ds="{NS["ds"]}" Id="placeholder"/>'
            f"<saml:Subject>"
            f'<saml:NameID Format="{EMAIL_FORMAT}">{escape(name_id)}</saml:NameID>'
            f'<saml:SubjectConfirmation Method="{BEARER}">'
            f"<saml:SubjectConfirmationData InResponseTo={quoteattr(in_response_to)} Recipient={quoteattr(recipient)} "
            f'NotOnOrAfter="{expires}"/>'
            f"</saml:SubjectConfirmation>"
            f"</saml:Subject>"
            f'<saml:Conditions NotBefore="{issued}" NotOnOrAfter="{expires}">'
            f"<saml:AudienceRestriction><saml:Audience>{escape(audience)}</saml:Audience></saml:AudienceRestriction>"
            f"</saml:Conditions>"
            f'<saml:AuthnStatement AuthnInstant="{issued}" SessionIndex="{new_id()}">'
            f"<saml:AuthnContext><saml:AuthnContextClassRef>"
            f"urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport"
            f"</saml:AuthnContextClassRef></saml:AuthnContext>"
            f"</saml:AuthnStatement>"
            f"<saml:AttributeStatement>{attribute_xml}</saml:AttributeStatement>"
            f"</saml:Assertion>"
            f"</samlp:Response>"
        )

    def sign(self, xml: str, sha1: bool = False) -> str:
        """Signs the assertion the way IdPs do: enveloped, exclusive canonicalization, RSA-SHA256 (or SHA-1, as old IdPs did)."""
        root = etree.fromstring(xml.encode())
        assertion_id = root.find("saml:Assertion", NS).get("ID")
        signer = (_OldSigner if sha1 else XMLSigner)(
            signature_algorithm="rsa-sha1" if sha1 else "rsa-sha256",
            digest_algorithm="sha1" if sha1 else "sha256",
            c14n_algorithm="http://www.w3.org/2001/10/xml-exc-c14n#",
        )
        # cert goes into KeyInfo; the SP must ignore it and use the certificate from metadata.
        signed = signer.sign(root, key=self.key_pem, cert=self.cert_pem, reference_uri=assertion_id, id_attribute="ID")
        return etree.tostring(signed).decode()

    def signed_response(self, sha1: bool = False, **options) -> str:
        return self.sign(self.response_xml(**options), sha1)


def authn_request_from(location: str):
    """Decodes the AuthnRequest from the SP's redirect, as the IdP does: Base64, then raw INFLATE."""
    encoded = parse_qs(urlsplit(location).query)["SAMLRequest"][0]
    return etree.fromstring(zlib.decompress(base64.b64decode(encoded), wbits=-15))
