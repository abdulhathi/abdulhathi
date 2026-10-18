// Everything a service provider must check in a SAML Response before it believes a word of it.
// The checks that need memory (replay, InResponseTo) are in app.ts; these need only the message and the clock.
import { DOMParser, onErrorStopParsing, type Document, type Element } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { BEARER, NS, SUCCESS, type Settings } from './saml.ts';

export const CLOCK_SKEW_MS = 60_000; // tolerate clocks that are up to a minute apart, no more

const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';

export class SamlError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function reject(message: string): never {
  throw new SamlError(401, message);
}

/** What the assertion says, once every check has passed. */
export type Login = {
  assertionId: string;
  inResponseTo: string;
  notOnOrAfter: number;
  nameId: string;
  attributes: Record<string, string[]>;
};

const children = (el: Element | undefined, ns: string, name: string): Element[] =>
  el ? Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === ns && (n as Element).localName === name) : [];
const child = (el: Element | undefined, ns: string, name: string): Element | undefined => children(el, ns, name)[0];
const text = (el: Element | undefined) => el?.textContent?.trim() ?? '';
const time = (value: string | null | undefined) => Date.parse(value ?? ''); // NaN when absent

function parse(xml: string): Document {
  try {
    const doc = new DOMParser({ onError: onErrorStopParsing }).parseFromString(xml, 'text/xml');
    // A SAML message never needs a DTD, and DTDs enable entity tricks (XXE, "billion laughs"): refuse them.
    if (doc.doctype) throw new Error('DOCTYPE');
    return doc;
  } catch {
    throw new SamlError(400, 'Malformed SAML response.');
  }
}

/**
 * Checks the XML signature on the assertion with the IdP's certificate, and returns the assertion *as it was signed*.
 * Reading from the returned element, never from the original document, is what defeats signature wrapping.
 */
function verifiedAssertion(xml: string, placed: Element, idpCert: string): Element {
  const id = placed.getAttribute('ID');
  const signatures = children(placed, NS.dsig, 'Signature');
  if (!id || signatures.length !== 1) return reject('Invalid signature.');
  // publicCert is the certificate from the IdP's metadata. xml-crypto ignores the certificate inside the message's
  // KeyInfo unless you ask for it, and you must not: an attacker can put any certificate there.
  const sig = new SignedXml({ publicCert: idpCert });
  try {
    sig.loadSignature(signatures[0].toString()); // the ds:Signature inside this assertion, as XML text
    const refs = sig.getReferences();
    const expected =
      sig.signatureAlgorithm === RSA_SHA256 && // no SHA-1
      sig.canonicalizationAlgorithm === EXC_C14N && // exclusive canonicalization
      refs.length === 1 &&
      refs[0].uri === `#${id}` && // the one reference is this very assertion
      refs[0].digestAlgorithm === SHA256 &&
      refs[0].transforms.join(' ') === `${ENVELOPED} ${EXC_C14N}`;
    if (!expected || !sig.checkSignature(xml)) return reject('Invalid signature.');
  } catch (err) {
    if (err instanceof SamlError) throw err;
    return reject('Invalid signature.'); // a wrong signature value, a broken digest, or a reference that resolves twice
  }
  const [signedXml] = sig.getSignedReferences(); // the canonical XML the IdP signed, with the signature removed
  const signed = new DOMParser().parseFromString(signedXml, 'text/xml').documentElement;
  if (!signed || signed.namespaceURI !== NS.assertion || signed.localName !== 'Assertion' || signed.getAttribute('ID') !== id) {
    return reject('Invalid signature.');
  }
  return signed;
}

export function validateResponse(samlResponse: string, s: Settings, now: number): Login {
  const xml = Buffer.from(samlResponse, 'base64').toString('utf8');
  const doc = parse(xml);
  const response = doc.documentElement;
  if (!response || response.namespaceURI !== NS.protocol || response.localName !== 'Response') {
    throw new SamlError(400, 'Malformed SAML response.');
  }

  // 1. The IdP must report success (a failed sign-in comes back as a Response too).
  const status = child(child(response, NS.protocol, 'Status'), NS.protocol, 'StatusCode');
  if (status?.getAttribute('Value') !== SUCCESS) reject('The identity provider did not report success.');

  // 2. Exactly one assertion in the whole document, directly inside the Response. A second, hidden one is how
  //    signature wrapping works: the signature covers one assertion while a naive reader reads the other.
  const found = [
    ...Array.from(doc.getElementsByTagNameNS(NS.assertion, 'Assertion')),
    ...Array.from(doc.getElementsByTagNameNS(NS.assertion, 'EncryptedAssertion')),
  ];
  if (found.length !== 1 || found[0].parentNode !== response) reject('The response must contain exactly one assertion.');

  // 3. The signature, and from here on only what it covers.
  const assertion = verifiedAssertion(xml, found[0], s.idpCert);
  const id = assertion.getAttribute('ID')!;

  // 4. Issued by the IdP we trust.
  if (text(child(assertion, NS.assertion, 'Issuer')) !== s.idpEntityId) reject('Wrong issuer.');

  // 5. About someone, confirmed by bearer: whoever presents it at the right address, before it expires.
  const subject = child(assertion, NS.assertion, 'Subject');
  const nameId = text(child(subject, NS.assertion, 'NameID'));
  const bearer = children(subject, NS.assertion, 'SubjectConfirmation').find((c) => c.getAttribute('Method') === BEARER);
  const data = child(bearer, NS.assertion, 'SubjectConfirmationData');
  if (!nameId || !data) return reject('The assertion has no bearer subject.');

  // 6. Sent to our ACS URL. Compare with your configured public URL, never with the Host header of this request.
  const destination = response.getAttribute('Destination');
  if (data.getAttribute('Recipient') !== s.acsUrl || (destination && destination !== s.acsUrl)) reject('Wrong recipient.');

  // 7. Meant for us: every AudienceRestriction must name our entity ID.
  const conditions = child(assertion, NS.assertion, 'Conditions');
  const restrictions = children(conditions, NS.assertion, 'AudienceRestriction');
  const forUs = (r: Element) => children(r, NS.assertion, 'Audience').some((a) => text(a) === s.spEntityId);
  if (restrictions.length === 0 || !restrictions.every(forUs)) reject('Wrong audience.');

  // 8. Inside its validity window, with a little clock skew. The earliest NotOnOrAfter wins; none at all is expired.
  if (now + CLOCK_SKEW_MS < time(conditions?.getAttribute('NotBefore'))) reject('The assertion is not valid yet.');
  const notOnOrAfter = Math.min(time(data.getAttribute('NotOnOrAfter')), time(conditions?.getAttribute('NotOnOrAfter')) || Infinity);
  if (!(now - CLOCK_SKEW_MS < notOnOrAfter)) reject('The assertion has expired.');

  // 9. An answer to a request: the signed InResponseTo, which the unsigned Response must not contradict.
  const inResponseTo = data.getAttribute('InResponseTo') ?? '';
  const outer = response.getAttribute('InResponseTo');
  if (!inResponseTo || (outer && outer !== inResponseTo)) reject('InResponseTo does not match a pending request.');

  const attributes: Record<string, string[]> = {};
  for (const statement of children(assertion, NS.assertion, 'AttributeStatement')) {
    for (const attribute of children(statement, NS.assertion, 'Attribute')) {
      attributes[attribute.getAttribute('Name') ?? ''] = children(attribute, NS.assertion, 'AttributeValue').map(text);
    }
  }
  return { assertionId: id, inResponseTo, notOnOrAfter, nameId, attributes };
}
