import type { ServerOptions } from 'node:https';

type Pem = string | Buffer;

/** HTTPS options that make every client prove who it is with a certificate signed by `ca`. */
export function mutualTlsOptions({ ca, cert, key }: { ca: Pem; cert: Pem; key: Pem }): ServerOptions {
  return {
    cert, // the server's own certificate and key: clients check this, as with any HTTPS site
    key,
    ca, // the CA (or CAs) whose client certificates we accept; nothing else is trusted
    requestCert: true, // ask the client for a certificate during the handshake
    rejectUnauthorized: true, // and end the handshake if it sends none, or one that `ca` did not sign
    minVersion: 'TLSv1.2',
  };
}
