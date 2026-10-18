import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import { DocumentStore, SEED } from './documents.ts';
import { authenticate, documentOf, loadDocument, requireRole, requireScope, userOf } from './middleware.ts';
import { can } from './policy.ts';

type Options = { key?: Uint8Array };

/** The only field a client may set. Anything else in the body (tenant, owner, status) is ignored. */
const titleOf = (body: unknown) => {
  const title = (body as { title?: unknown } | undefined)?.title;
  return typeof title === 'string' ? title.trim() : '';
};

export function createApp({ key = randomBytes(32) }: Options = {}) {
  const store = new DocumentStore(SEED);
  const app = express();
  app.use(authenticate(key)); // every route below needs a valid token (deny by default)
  app.use(express.json()); // bodies are parsed only for callers we know

  app.get('/documents', requireScope('documents:read'), (_req, res) => {
    const user = userOf(res);
    // Tenant filter in the query, then the same read rule as GET /documents/:id.
    res.json({ documents: store.list(user.tenant).filter((d) => can(user, 'read', d)) });
  });

  app.get('/documents/:id', requireScope('documents:read'), loadDocument(store, 'read'), (_req, res) => {
    res.json(documentOf(res));
  });

  app.post('/documents', requireScope('documents:write'), requireRole('editor', 'admin'), (req, res) => {
    const user = userOf(res);
    const title = titleOf(req.body);
    if (!title) return res.status(400).json({ error: 'Enter a title.' });
    // Tenant, owner, department and status come from the token and the server, never from the request body.
    const doc = { id: randomUUID(), tenant: user.tenant, owner: user.id, department: user.department, title, status: 'draft' as const };
    store.add(doc);
    res.status(201).location(`/documents/${doc.id}`).json(doc);
  });

  app.put('/documents/:id', requireScope('documents:write'), loadDocument(store, 'update'), (req, res) => {
    const title = titleOf(req.body); // checked after the access checks, so a 400 never confirms that an id exists
    if (!title) return res.status(400).json({ error: 'Enter a title.' });
    const doc = documentOf(res);
    doc.title = title;
    res.json(doc);
  });

  app.post('/documents/:id/publish', requireScope('documents:write'), loadDocument(store, 'publish'), (_req, res) => {
    const doc = documentOf(res);
    doc.status = 'published';
    res.json(doc);
  });

  app.delete('/documents/:id', requireScope('documents:write'), requireRole('admin'), loadDocument(store, 'delete'), (_req, res) => {
    const user = userOf(res);
    store.remove(user.tenant, documentOf(res).id);
    res.status(204).end();
  });

  return { app, store, key };
}
