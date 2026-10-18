// HTTP Basic authentication (RFC 7617): "Authorization: Basic base64(username:password)" on every request.
import type { NextFunction, Request, Response } from 'express';

export const REALM = 'Auth Lab';
export const CHALLENGE = `Basic realm="${REALM}", charset="UTF-8"`;
export const REQUIRED = 'Authentication required.';
export const INVALID = 'Username or password is incorrect.';

export type Credentials = { username: string; password: string };
// Standard base64 with its padding (RFC 4648): groups of four characters, nothing else. Buffer.from(…, 'base64') would
// quietly skip anything that is not base64 and accept missing padding, so check first.
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const utf8 = new TextDecoder('utf-8', { fatal: true });

/** 'missing' when there are no Basic credentials at all; 'malformed' when the header is not valid Basic. */
export function parseBasic(header: string | undefined): Credentials | 'missing' | 'malformed' {
  const value = header ?? '';
  const space = value.indexOf(' '); // "Basic", one or more spaces, then the base64 (RFC 9110 credentials)
  const scheme = space < 0 ? value : value.slice(0, space);
  const param = space < 0 ? '' : value.slice(space + 1).trim();
  if (scheme.toLowerCase() !== 'basic') return 'missing'; // the scheme name is case-insensitive
  if (!BASE64.test(param)) return 'malformed';
  let decoded: string;
  try {
    decoded = utf8.decode(Buffer.from(param, 'base64')); // charset="UTF-8": anything else is refused
  } catch {
    return 'malformed';
  }
  const colon = decoded.indexOf(':'); // the first colon: a username cannot contain one, a password can
  if (colon < 0) return 'malformed';
  // RFC 7617 asks clients to send Unicode in Normalization Form C. Normalizing here too means "\u00eb" and "e\u0308"
  // (the same letter, written two ways) match.
  return { username: decoded.slice(0, colon).normalize('NFC'), password: decoded.slice(colon + 1).normalize('NFC') };
}

/** 401 with a challenge: browsers show their sign-in dialog, and clients know which scheme to use. */
function challenge(res: Response, error: string) {
  res.set('WWW-Authenticate', CHALLENGE).status(401).json({ error });
}

/** Middleware: lets the request through only with a valid username and password, and records who it was. */
export function basicAuth(check: (username: string, password: string) => Promise<boolean>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const credentials = parseBasic(req.get('Authorization'));
    if (credentials === 'missing') return challenge(res, REQUIRED);
    if (credentials === 'malformed' || !(await check(credentials.username, credentials.password))) return challenge(res, INVALID);
    res.locals.username = credentials.username;
    next();
  };
}
