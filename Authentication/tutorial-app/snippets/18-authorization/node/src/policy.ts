// Every rule about documents in one place, as a pure function: easy to read, review and test.
import type { Document } from './documents.ts';
import type { User } from './tokens.ts';

export type Action = 'read' | 'update' | 'publish' | 'delete';

export function can(user: User, action: Action, doc: Document): boolean {
  // Tenant isolation comes first and has no exceptions, not even for admins.
  if (doc.tenant !== user.tenant) return false;
  const admin = user.roles.includes('admin');
  const editor = user.roles.includes('editor');
  const owner = doc.owner === user.id;
  switch (action) {
    case 'read': // published documents are for everyone in the tenant; drafts for their owner, editors and admins
      return doc.status === 'published' || owner || editor || admin;
    case 'update': // ownership: only the author changes the text (or an admin)
      return owner || admin;
    case 'publish': // an attribute rule (ABAC): editors publish only in their own department
      return admin || (editor && doc.department === user.department);
    case 'delete': // a role rule (RBAC)
      return admin;
  }
}
