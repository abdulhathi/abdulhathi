"""A small certificate authority for the lab, made with the cryptography package. Every file goes into the folder you
pass, normally a temporary one, so private keys never go near the repository. <name>.crt is a certificate (public);
<name>.key.pem is its private key."""
import ipaddress
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def _name(common_name: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])


def _save(folder: Path, name: str, cert: x509.Certificate, key: ec.EllipticCurvePrivateKey) -> None:
    (folder / f"{name}.crt").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    (folder / f"{name}.key.pem").write_bytes(
        key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    )


def _builder(subject: x509.Name, issuer: x509.Name, public_key, not_before=None, not_after=None) -> x509.CertificateBuilder:
    now = datetime.now(timezone.utc)
    return (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before or now - timedelta(minutes=5))
        .not_valid_after(not_after or now + timedelta(days=30))
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(public_key), critical=False)
    )


def create_ca(folder: Path, name: str, common_name: str) -> None:
    """A self-signed certificate authority: the only thing allowed to vouch for clients."""
    key = ec.generate_private_key(ec.SECP256R1())
    cert = (
        _builder(_name(common_name), _name(common_name), key.public_key())
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(
            x509.KeyUsage(digital_signature=False, content_commitment=False, key_encipherment=False,
                          data_encipherment=False, key_agreement=False, key_cert_sign=True, crl_sign=True,
                          encipher_only=False, decipher_only=False),
            critical=True,
        )
        .sign(key, hashes.SHA256())
    )
    _save(folder, name, cert, key)


def issue(
    folder: Path,
    ca: str,
    name: str,
    common_name: str,
    usage: str,
    *,
    subject: x509.Name | None = None,  # for the tests' odd certificates: a whole subject instead of just a CN,
    not_before: datetime | None = None,  # or validity dates of your choice
    not_after: datetime | None = None,
) -> None:
    """A certificate signed by the CA, for a "server" (with its host names) or for a "client"."""
    ca_cert = x509.load_pem_x509_certificate((folder / f"{ca}.crt").read_bytes())
    ca_key = serialization.load_pem_private_key((folder / f"{ca}.key.pem").read_bytes(), password=None)
    key = ec.generate_private_key(ec.SECP256R1())
    purpose = ExtendedKeyUsageOID.SERVER_AUTH if usage == "server" else ExtendedKeyUsageOID.CLIENT_AUTH
    builder = (
        _builder(subject or _name(common_name), ca_cert.subject, key.public_key(), not_before, not_after)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_cert.public_key()), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False,
                          data_encipherment=False, key_agreement=False, key_cert_sign=False, crl_sign=False,
                          encipher_only=False, decipher_only=False),
            critical=True,
        )
        .add_extension(x509.ExtendedKeyUsage([purpose]), critical=False)
    )
    if usage == "server":
        names = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
        builder = builder.add_extension(x509.SubjectAlternativeName(names), critical=False)
    _save(folder, name, builder.sign(ca_key, hashes.SHA256()), key)


def create_lab_certificates(folder: Path) -> None:
    """Everything the lab uses, made once per folder. The same files work with the Node.js and .NET servers."""
    if (folder / "stranger.crt").exists():
        return
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)  # only you can read the private keys in it
    create_ca(folder, "ca", "Auth Lab CA")
    issue(folder, "ca", "server", "localhost", "server")
    issue(folder, "ca", "client", "billing-service", "client")  # registered with the API
    issue(folder, "ca", "unknown", "reports-service", "client")  # signed by our CA, but not registered
    create_ca(folder, "other-ca", "Some Other CA")
    issue(folder, "other-ca", "stranger", "billing-service", "client")  # a registered name, from the wrong CA
