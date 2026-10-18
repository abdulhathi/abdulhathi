// SAML 2.0 names, the service provider's settings, and the two documents it sends out: the AuthnRequest and its
// metadata. The IdP's values come from the IdP's metadata; yours go into the IdP's configuration for your app.
import { randomBytes } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

export const NS = {
  protocol: 'urn:oasis:names:tc:SAML:2.0:protocol', // samlp: messages (AuthnRequest, Response)
  assertion: 'urn:oasis:names:tc:SAML:2.0:assertion', // saml: the signed statement about the user
  metadata: 'urn:oasis:names:tc:SAML:2.0:metadata', // md: who is who, and at which URLs
  dsig: 'http://www.w3.org/2000/09/xmldsig#', // ds: XML Signature
};
export const POST_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST';
export const EMAIL_FORMAT = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
export const SUCCESS = 'urn:oasis:names:tc:SAML:2.0:status:Success';
export const BEARER = 'urn:oasis:names:tc:SAML:2.0:cm:bearer';

export type Settings = {
  spEntityId: string; // who we are: the Audience the IdP must name in every assertion meant for us
  acsUrl: string; // where the IdP posts responses: the Destination and Recipient it must use
  idpEntityId: string; // the only Issuer we accept
  idpSsoUrl: string; // where we send the browser to sign in
  idpCert: string; // the IdP's signing certificate (PEM), from its metadata, never from the message
};

export const EXAMPLE_SETTINGS = {
  spEntityId: 'https://sp.example.com/saml/metadata',
  acsUrl: 'https://sp.example.com/saml/acs',
  idpEntityId: 'https://idp.example.com/saml',
  idpSsoUrl: 'https://idp.example.com/saml/sso',
};

/** A SAML ID is an XML name, so it must not start with a digit: "_" and 160 random bits. */
export const newId = () => `_${randomBytes(20).toString('hex')}`;

/** SAML times are UTC xs:dateTime values: 2026-10-17T12:00:00Z. */
export const instant = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function authnRequest(s: Settings, id: string, now: number): string {
  return (
    `<samlp:AuthnRequest xmlns:samlp="${NS.protocol}" xmlns:saml="${NS.assertion}" ID="${id}" Version="2.0" ` +
    `IssueInstant="${instant(now)}" Destination="${s.idpSsoUrl}" AssertionConsumerServiceURL="${s.acsUrl}" ` +
    `ProtocolBinding="${POST_BINDING}">` +
    `<saml:Issuer>${s.spEntityId}</saml:Issuer>` +
    `<samlp:NameIDPolicy Format="${EMAIL_FORMAT}" AllowCreate="true"/>` +
    `</samlp:AuthnRequest>`
  );
}

/** HTTP-Redirect binding: raw DEFLATE, then Base64, then URL-encode it as the SAMLRequest query parameter. */
export function redirectUrl(s: Settings, requestXml: string): string {
  const url = new URL(s.idpSsoUrl);
  url.searchParams.set('SAMLRequest', deflateRawSync(requestXml).toString('base64'));
  return url.toString();
}

/** What the IdP's administrator needs to register this service provider. */
export function metadata(s: Settings): string {
  return [
    `<md:EntityDescriptor xmlns:md="${NS.metadata}" entityID="${s.spEntityId}">`,
    `  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="${NS.protocol}">`,
    `    <md:NameIDFormat>${EMAIL_FORMAT}</md:NameIDFormat>`,
    `    <md:AssertionConsumerService Binding="${POST_BINDING}" Location="${s.acsUrl}" index="0" isDefault="true"/>`,
    `  </md:SPSSODescriptor>`,
    `</md:EntityDescriptor>`,
  ].join('\n');
}
