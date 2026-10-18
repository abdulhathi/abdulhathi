// The documents table. Every method takes the caller's tenant, so no query can reach another tenant's rows.
import type { Claims } from './tokens.ts';

export type Status = 'draft' | 'published';
export type Document = { id: string; tenant: string; owner: string; department: string; title: string; status: Status };

export class DocumentStore {
  private rows = new Map<string, Document>(); // a real app uses a database table with a tenant column
  constructor(seed: Document[] = []) {
    for (const d of seed) this.rows.set(d.id, { ...d });
  }

  /** Every document in one tenant, by id. The tenant filter is part of the query, not an afterthought. */
  list(tenant: string): Document[] {
    return [...this.rows.values()].filter((d) => d.tenant === tenant).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** One document, only if it belongs to this tenant. Another tenant's id looks exactly like a missing one. */
  get(tenant: string, id: string): Document | undefined {
    const d = this.rows.get(id);
    return d && d.tenant === tenant ? d : undefined;
  }

  add(doc: Document): void {
    this.rows.set(doc.id, doc);
  }

  remove(tenant: string, id: string): boolean {
    return this.get(tenant, id) !== undefined && this.rows.delete(id);
  }
}

// Demo data: two tenants, north and south. The same users and documents exist in every stack.
export const USERS: Record<string, Claims> = {
  ada: { sub: 'ada', tenant: 'north', roles: ['editor'], department: 'sales' },
  bo: { sub: 'bo', tenant: 'north', roles: ['viewer'], department: 'sales' },
  cy: { sub: 'cy', tenant: 'north', roles: ['editor'], department: 'support' },
  di: { sub: 'di', tenant: 'north', roles: ['admin'], department: 'it' },
  eve: { sub: 'eve', tenant: 'south', roles: ['admin'], department: 'sales' },
};

export const SEED: Document[] = [
  { id: 'd1', tenant: 'north', owner: 'ada', department: 'sales', title: 'Sales plan', status: 'draft' },
  { id: 'd2', tenant: 'north', owner: 'ada', department: 'sales', title: 'Price list', status: 'published' },
  { id: 'd3', tenant: 'north', owner: 'cy', department: 'support', title: 'Support rota', status: 'draft' },
  { id: 'd4', tenant: 'south', owner: 'eve', department: 'sales', title: 'South roadmap', status: 'draft' },
];
