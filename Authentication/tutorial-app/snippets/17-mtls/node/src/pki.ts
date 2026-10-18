// A small certificate authority for the lab, made with the openssl command. It needs OpenSSL 3.4 or later (for
// `req -CA` and `-not_before`): on macOS that is Homebrew's openssl, not the LibreSSL in /usr/bin.
// Every file goes into the folder you pass, normally a temporary one, so private keys never go near the repository.
// <name>.crt is a certificate (public); <name>.key.pem is its private key.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const P256 = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-noenc']; // a new ECDSA P-256 key, unencrypted
const openssl = (args: string[]) => execFileSync('openssl', args, { stdio: 'pipe' });
const asn1Time = (d: Date) => `${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`; // 20261017120000Z

/** A self-signed certificate authority: the only thing allowed to vouch for clients. */
export function createCa(dir: string, name: string, commonName: string): void {
  openssl(['req', '-x509', ...P256, '-keyout', join(dir, `${name}.key.pem`), '-out', join(dir, `${name}.crt`),
    '-days', '30', '-subj', `/CN=${commonName}`,
    '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
}

/** For the tests' odd certificates: a whole subject instead of just a CN, or validity dates of your choice. */
export type IssueOptions = { subject?: string; notBefore?: Date; notAfter?: Date };

/** A certificate signed by the CA, for a server (with its host names) or for a client. */
export function issue(dir: string, ca: string, name: string, commonName: string, usage: 'server' | 'client', options: IssueOptions = {}): void {
  const { subject = `/CN=${commonName}`, notBefore, notAfter } = options;
  const purpose = usage === 'server'
    ? ['-addext', 'extendedKeyUsage=serverAuth', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1']
    : ['-addext', 'extendedKeyUsage=clientAuth'];
  const validity = notBefore && notAfter ? ['-not_before', asn1Time(notBefore), '-not_after', asn1Time(notAfter)] : ['-days', '30'];
  openssl(['req', '-x509', ...P256, '-keyout', join(dir, `${name}.key.pem`), '-out', join(dir, `${name}.crt`),
    ...validity, '-subj', subject, '-CA', join(dir, `${ca}.crt`), '-CAkey', join(dir, `${ca}.key.pem`),
    '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'keyUsage=critical,digitalSignature', ...purpose]);
}

/** Everything the lab uses, made once per folder. The same files work with the Python and .NET servers. */
export function createLabCertificates(dir: string): void {
  if (existsSync(join(dir, 'stranger.crt'))) return;
  mkdirSync(dir, { recursive: true, mode: 0o700 }); // only you can read the private keys in it
  createCa(dir, 'ca', 'Auth Lab CA');
  issue(dir, 'ca', 'server', 'localhost', 'server');
  issue(dir, 'ca', 'client', 'billing-service', 'client'); // registered with the API
  issue(dir, 'ca', 'unknown', 'reports-service', 'client'); // signed by our CA, but not registered
  createCa(dir, 'other-ca', 'Some Other CA');
  issue(dir, 'other-ca', 'stranger', 'billing-service', 'client'); // a registered name, from the wrong CA
}
