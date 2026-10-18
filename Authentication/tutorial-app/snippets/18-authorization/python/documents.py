"""The documents table. Every method takes the caller's tenant, so no query can reach another tenant's rows."""
from dataclasses import dataclass, replace


@dataclass
class Document:
    id: str
    tenant: str
    owner: str
    department: str
    title: str
    status: str  # "draft" or "published"


class DocumentStore:
    def __init__(self, seed: list[Document] | None = None) -> None:
        self._rows = {d.id: replace(d) for d in seed or []}  # a real app uses a database table with a tenant column

    def list(self, tenant: str) -> list[Document]:
        """Every document in one tenant, by id. The tenant filter is part of the query, not an afterthought."""
        return sorted((d for d in self._rows.values() if d.tenant == tenant), key=lambda d: d.id)

    def get(self, tenant: str, doc_id: str) -> Document | None:
        """One document, only if it belongs to this tenant. Another tenant's id looks exactly like a missing one."""
        d = self._rows.get(doc_id)
        return d if d is not None and d.tenant == tenant else None

    def add(self, doc: Document) -> None:
        self._rows[doc.id] = doc

    def remove(self, tenant: str, doc_id: str) -> bool:
        return self.get(tenant, doc_id) is not None and self._rows.pop(doc_id, None) is not None


# Demo data: two tenants, north and south. The same users and documents exist in every stack.
USERS: dict[str, dict] = {
    "ada": {"sub": "ada", "tenant": "north", "roles": ["editor"], "department": "sales"},
    "bo": {"sub": "bo", "tenant": "north", "roles": ["viewer"], "department": "sales"},
    "cy": {"sub": "cy", "tenant": "north", "roles": ["editor"], "department": "support"},
    "di": {"sub": "di", "tenant": "north", "roles": ["admin"], "department": "it"},
    "eve": {"sub": "eve", "tenant": "south", "roles": ["admin"], "department": "sales"},
}

SEED = [
    Document("d1", "north", "ada", "sales", "Sales plan", "draft"),
    Document("d2", "north", "ada", "sales", "Price list", "published"),
    Document("d3", "north", "cy", "support", "Support rota", "draft"),
    Document("d4", "south", "eve", "sales", "South roadmap", "draft"),
]
