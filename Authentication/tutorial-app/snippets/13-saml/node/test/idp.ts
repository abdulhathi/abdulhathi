// A tiny identity provider for the tests. It makes its own RSA key and self-signed certificate (with the openssl
// command, into a temporary folder it deletes), reads AuthnRequests, and builds and signs SAML Responses.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { DOMParser, type Element } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { BEARER, EMAIL_FORMAT, EXAMPLE_SETTINGS, instant, newId, NS, SUCCESS } from '../src/saml.ts';

export type Idp = { key: string; cert: string };

export function createIdp(commonName = 'idp.example.com'): Idp {
  const dir = mkdtempSync(join(tmpdir(), 'saml-idp-'));
  try {
    const key = join(dir, 'idp.key.pem');
    const cert = join(dir, 'idp.crt');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-noenc', '-keyout', key, '-out', cert, '-days', '2', '-subj', `/CN=${commonName}`], { stdio: 'ignore' });
    return { key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Decodes the AuthnRequest from the SP's redirect, as the IdP does: Base64, then raw INFLATE. */
export function authnRequestFrom(location: string): Element {
  const encoded = new URL(location).searchParams.get('SAMLRequest') ?? '';
  const xml = inflateRawSync(Buffer.from(encoded, 'base64')).toString('utf8');
  return new DOMParser().parseFromString(xml, 'text/xml').documentElement!;
}

export type ResponseOptions = {
  inResponseTo: string;
  now: number;
  nameId?: string;
  attributes?: Record<string, string[]>;
  issuer?: string;
  audience?: string;
  recipient?: string; // the ACS URL, used for both Destination and Recipient
  lifetimeMs?: number;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function responseXml(o: ResponseOptions): string {
  const nameId = o.nameId ?? 'ada@example.com';
  const attributes = o.attributes ?? { email: [nameId], name: ['Ada Lovelace'], groups: ['engineering'] };
  const issuer = o.issuer ?? EXAMPLE_SETTINGS.idpEntityId;
  const recipient = o.recipient ?? EXAMPLE_SETTINGS.acsUrl;
  const now = instant(o.now);
  const expires = instant(o.now + (o.lifetimeMs ?? 5 * 60 * 1000));
  const attributeXml = Object.entries(attributes)
    .map(([name, values]) => `<saml:Attribute Name="${esc(name)}">${values.map((v) => `<saml:AttributeValue>${esc(v)}</saml:AttributeValue>`).join('')}</saml:Attribute>`)
    .join('');
  return (
    `<samlp:Response xmlns:samlp="${NS.protocol}" xmlns:saml="${NS.assertion}" ID="${newId()}" Version="2.0" IssueInstant="${now}" Destination="${esc(recipient)}" InResponseTo="${esc(o.inResponseTo)}">` +
    `<saml:Issuer>${esc(issuer)}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="${SUCCESS}"/></samlp:Status>` +
    `<saml:Assertion ID="${newId()}" Version="2.0" IssueInstant="${now}">` +
    `<saml:Issuer>${esc(issuer)}</saml:Issuer>` +
    `<saml:Subject>` +
    `<saml:NameID Format="${EMAIL_FORMAT}">${esc(nameId)}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="${BEARER}">` +
    `<saml:SubjectConfirmationData InResponseTo="${esc(o.inResponseTo)}" Recipient="${esc(recipient)}" NotOnOrAfter="${expires}"/>` +
    `</saml:SubjectConfirmation>` +
    `</saml:Subject>` +
    `<saml:Conditions NotBefore="${now}" NotOnOrAfter="${expires}">` +
    `<saml:AudienceRestriction><saml:Audience>${esc(o.audience ?? EXAMPLE_SETTINGS.spEntityId)}</saml:Audience></saml:AudienceRestriction>` +
    `</saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${now}" SessionIndex="${newId()}">` +
    `<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>` +
    `</saml:AuthnStatement>` +
    `<saml:AttributeStatement>${attributeXml}</saml:AttributeStatement>` +
    `</saml:Assertion>` +
    `</samlp:Response>`
  );
}

const ASSERTION = "//*[local-name(.)='Assertion']";

export type Algorithms = { signature: string; digest: string };
export const SHA256: Algorithms = {
  signature: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  digest: 'http://www.w3.org/2001/04/xmlenc#sha256',
};
/** What old IdPs used. The SP must refuse it even when the signature itself is genuine. */
export const SHA1: Algorithms = {
  signature: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  digest: 'http://www.w3.org/2000/09/xmldsig#sha1',
};

/** Signs the assertion the way IdPs do: enveloped, exclusive canonicalization, RSA-SHA256, placed after its Issuer. */
export function sign(xml: string, idp: Idp, algorithms = SHA256): string {
  const sig = new SignedXml({
    privateKey: idp.key,
    publicCert: idp.cert, // goes into KeyInfo; the SP must ignore it and use the certificate from metadata
    signatureAlgorithm: algorithms.signature,
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    xpath: ASSERTION,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
    digestAlgorithm: algorithms.digest,
  });
  sig.computeSignature(xml, { prefix: 'ds', location: { reference: `${ASSERTION}/*[local-name(.)='Issuer']`, action: 'after' } });
  return sig.getSignedXml();
}

export const signedResponse = (o: ResponseOptions, idp: Idp, algorithms = SHA256) => sign(responseXml(o), idp, algorithms);
