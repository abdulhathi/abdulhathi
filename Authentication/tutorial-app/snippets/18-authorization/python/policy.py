"""Every rule about documents in one place, as a pure function: easy to read, review and test."""
from typing import Literal

from documents import Document
from tokens import User

Action = Literal["read", "update", "publish", "delete"]


def can(user: User, action: Action, doc: Document) -> bool:
    # Tenant isolation comes first and has no exceptions, not even for admins.
    if doc.tenant != user.tenant:
        return False
    admin = "admin" in user.roles
    editor = "editor" in user.roles
    owner = doc.owner == user.id
    match action:
        case "read":  # published documents are for everyone in the tenant; drafts for their owner, editors and admins
            return doc.status == "published" or owner or editor or admin
        case "update":  # ownership: only the author changes the text (or an admin)
            return owner or admin
        case "publish":  # an attribute rule (ABAC): editors publish only in their own department
            return admin or (editor and doc.department == user.department)
        case "delete":  # a role rule (RBAC)
            return admin
    return False
