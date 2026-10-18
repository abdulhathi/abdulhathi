// The resource server (the API) checks every access token itself: signature, issuer, audience, type, expiry, scope.
// Here it holds the authorization server's public key directly; across a network it would fetch it from a JWKS URL.
// It also refuses revoked tokens. In one process it can read the server's list; a separate API would ask the server
// (token introspection) or receive a deny list.
import type { NextFunction, Request, Response } from 'express';
import { jwtVerify, type JWTPayload } from 'jose';
import { AUDIENCE } from './authorization-server.ts';

type Options = { issuer: string; verifyKey: CryptoKey; now: () => number; revoked: ReadonlySet<string> };

/** Express middleware: only requests with a valid access token that carries `scope` get through. */
export function requireScope(scope: string, { issuer, verifyKey, now, revoked }: Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '');
    if (!bearer) {
      // No credentials at all: RFC 6750 says answer with the scheme and no error code.
      res.set('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ error: 'unauthorized', error_description: 'A bearer token is required.' });
    }
    let token: JWTPayload;
    try {
      ({ payload: token } = await jwtVerify(bearer[1], verifyKey, {
        issuer,
        audience: AUDIENCE,
        algorithms: ['RS256'],
        typ: 'at+jwt',
        currentDate: new Date(now()),
      }));
      if (typeof token.jti !== 'string' || revoked.has(token.jti)) throw new Error('revoked');
    } catch {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return res.status(401).json({ error: 'invalid_token', error_description: 'The access token is invalid or expired.' });
    }
    const granted = String(token.scope ?? '').split(' ');
    if (!granted.includes(scope)) {
      res.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${scope}"`);
      return res.status(403).json({ error: 'insufficient_scope', error_description: `This call needs the ${scope} scope.` });
    }
    res.locals.token = token;
    next();
  };
}
