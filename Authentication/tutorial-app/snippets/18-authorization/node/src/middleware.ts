// Express middleware, run in this order on each route: who are you (401), may this token do this (403),
// may your role do this (403), and may you do this to this document (404 or 403).
import type { RequestHandler, Response } from 'express';
import type { DocumentStore, Document } from './documents.ts';
import { can, type Action } from './policy.ts';
import { verifyToken, type User } from './tokens.ts';

export const UNAUTHORIZED = { error: 'Missing or invalid token.' };
export const FORBIDDEN = { error: 'You are not allowed to do that.' };
export const NOT_FOUND = { error: 'Document not found.' };

export const userOf = (res: Response) => res.locals.user as User;
export const documentOf = (res: Response) => res.locals.document as Document;

/** 401 unless the request carries a valid bearer token. Mounted on the whole app: deny by default. */
export function authenticate(key: Uint8Array): RequestHandler {
  return async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    const sent = scheme?.toLowerCase() === 'bearer' && !!token;
    const user = sent ? await verifyToken(key, token) : null;
    if (!user) {
      // RFC 6750: a bare challenge when no token came, error="invalid_token" when one was refused.
      res.setHeader('WWW-Authenticate', sent ? 'Bearer error="invalid_token"' : 'Bearer');
      return res.status(401).json(UNAUTHORIZED);
    }
    res.locals.user = user;
    next();
  };
}

/** Scopes limit what a token may do, whoever the user is (RFC 6750 names the error insufficient_scope). */
export function requireScope(scope: string): RequestHandler {
  return (_req, res, next) => {
    if (userOf(res).scopes.includes(scope)) return next();
    res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${scope}"`);
    res.status(403).json({ error: `This token lacks the ${scope} scope.` });
  };
}

/** Role-based access control: the user needs at least one of these roles. */
export function requireRole(...roles: string[]): RequestHandler {
  return (_req, res, next) => (userOf(res).roles.some((r) => roles.includes(r)) ? next() : res.status(403).json(FORBIDDEN));
}

/**
 * Loads :id from the caller's own tenant and checks the policy for this action.
 * 404 when the caller may not even see the document (another tenant's, or someone else's draft), so its existence
 * is not revealed; 403 when they can see it but may not do this to it.
 */
export function loadDocument(store: DocumentStore, action: Action): RequestHandler {
  return (req, res, next) => {
    const user = userOf(res);
    const doc = store.get(user.tenant, String(req.params.id));
    if (!doc || !can(user, 'read', doc)) return res.status(404).json(NOT_FOUND);
    if (!can(user, action, doc)) return res.status(403).json(FORBIDDEN);
    res.locals.document = doc;
    next();
  };
}
