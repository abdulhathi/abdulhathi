---
title: SQLAlchemy 2 and data access
goal: Explain how SQLAlchemy's Session, unit of work and loading strategies behave, spot and fix an N+1 query, and wire a database session into FastAPI correctly.
minutes: 45
---

SQLAlchemy is the standard way Python services talk to relational databases, and FastAPI projects almost always pair with it (directly or through SQLModel, which is built on it). Interviewers use it to test whether you understand what happens between your Python objects and the SQL that runs: when queries are sent, when transactions commit, and why a list page suddenly issues 101 queries.

Everything here uses the **SQLAlchemy 2.0 style** (`DeclarativeBase`, `Mapped[...]`, `mapped_column`, `select()`), which is what new code and current docs use; the legacy `session.query(...)` API still works but signals older code. Every example runs against an in-memory SQLite database.

## The moving parts

| Piece | What it is | Lifetime |
|---|---|---|
| `Engine` | Connection factory plus a connection pool, created once per database URL | One per app process |
| `Connection` | One DBAPI connection checked out from the pool (Core level) | Per unit of work |
| `Session` | ORM unit of work: tracks objects, flushes changes, owns a transaction | One per request or task |
| `DeclarativeBase` | Base class that maps Python classes to tables | Defined once |
| `select()` | The query construct for both Core and ORM | Per query |

A typical mapping in 2.0 style, used through the rest of the chapter:

```python
from sqlalchemy import ForeignKey, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None]                      # Optional → nullable column
    encounters: Mapped[list["Encounter"]] = relationship(back_populates="patient", cascade="all, delete-orphan")


class Encounter(Base):
    __tablename__ = "encounters"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    patient: Mapped[Patient] = relationship(back_populates="encounters")


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)

with Session(engine) as session:
    session.add(Patient(name="Maria Garcia", encounters=[Encounter(kind="office"), Encounter(kind="er")]))
    session.commit()

    maria = session.scalars(select(Patient).where(Patient.name == "Maria Garcia")).one()
    assert [e.kind for e in maria.encounters] == ["office", "er"]
    assert maria.encounters[0].patient is maria   # back_populates keeps both sides in sync
```

The type annotations drive the schema: `Mapped[str | None]` becomes a nullable column, `Mapped[str]` is `NOT NULL`, and `Mapped[list["Encounter"]]` declares a one-to-many collection.

## Interview questions

### What is an ORM, and what are its trade-offs? {core}

An object-relational mapper maps tables to classes and rows to objects, so application code works with Python objects while the ORM generates SQL, tracks changes and manages transactions. The benefits are productivity, less boilerplate, database portability, protection from SQL injection through bound parameters, and a single place for the data model.

The costs: it hides the SQL, so it is easy to write inefficient access patterns (N+1 queries, loading whole objects for one column), complex reporting queries are often clearer in SQL, and there is a learning curve around sessions and loading. Good teams use the ORM for transactional CRUD and drop to Core or `text()` for heavy reporting, and they always watch the generated SQL.

### Core vs ORM: what is the difference?

SQLAlchemy Core is the SQL expression layer: tables, `select()`, `insert()`, connections and transactions, returning plain rows. The ORM sits on top: mapped classes, the `Session`, identity map, unit of work and relationships, returning objects. Since 2.0 both use the same `select()` construct, so you can mix them freely; use Core for bulk and reporting work where object tracking is pure overhead, and the ORM for domain logic.

### What is the Session, and what are the unit of work and the identity map? {core}

The `Session` is the ORM's workspace for one logical unit of work, usually one web request. As you add and modify objects, it records the changes (the **unit of work**) and on flush it emits the needed `INSERT`, `UPDATE` and `DELETE` statements in dependency order, inside one transaction. The **identity map** guarantees one Python object per database row per session: loading the same primary key twice returns the same object, without a second query when you use `session.get()`.

```python
from sqlalchemy import String, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)
statements: list[str] = []
event.listen(engine, "before_cursor_execute", lambda conn, cur, stmt, *args: statements.append(stmt))

with Session(engine) as session:
    session.add(Patient(id=1, name="Maria"))
    session.commit()

with Session(engine) as session:
    statements.clear()
    first = session.get(Patient, 1)
    second = session.get(Patient, 1)
    assert first is second             # identity map: one object per row per session
    assert len(statements) == 1        # the second get() did not query

    first.name = "Maria Garcia"        # only tracked in memory so far
    assert first in session.dirty      # tracked as a pending change
    session.commit()                   # unit of work: flush the UPDATE, then COMMIT
    assert any(s.startswith("UPDATE patients") for s in statements)
```

### What is the difference between flush and commit? {core}

`flush()` sends the pending SQL for tracked changes to the database inside the current transaction, so the database assigns IDs and enforces constraints, but nothing is permanent and other connections cannot see it. `commit()` flushes and then commits the transaction, making the changes durable and visible. Autoflush runs a flush automatically before queries so they see your pending changes.

Use an explicit `flush()` when you need a generated primary key before the transaction ends, for example to create a claim and then reference its ID in an audit row in the same transaction.

### What states can an ORM object be in? {deep}

**Transient**: a new object not in any session. **Pending**: added to a session but not flushed. **Persistent**: in a session and backed by a database row. **Detached**: was persistent, but its session closed or it was expunged. **Deleted**: marked for deletion and flushed, not yet committed.

```python
from sqlalchemy import String, create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)

patient = Patient(name="Li Wei")
assert inspect(patient).transient

with Session(engine) as session:
    session.add(patient)
    assert inspect(patient).pending
    session.flush()
    assert inspect(patient).persistent and patient.id is not None   # the database assigned the ID
    session.commit()

assert inspect(patient).detached   # the session is closed
```

Why it matters: lazy loading only works on persistent objects. Accessing an unloaded relationship on a detached object raises `DetachedInstanceError`, a common bug when objects leave a request's session.

### What is the N+1 query problem, and how do you fix it in SQLAlchemy? {core}

N+1 happens when you load N parent rows with one query and then touch a lazy-loaded relationship on each, which fires one more query per parent: 1 + N round trips. It is invisible in the code (it looks like a simple loop) and deadly at scale. Detect it by logging SQL (`echo=True` or a statement counter in tests); fix it by choosing an eager loading strategy for that query, usually `selectinload` for collections and `joinedload` for many-to-one.

```python
from sqlalchemy import ForeignKey, String, create_engine, event, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, joinedload, mapped_column, relationship, selectinload


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    encounters: Mapped[list["Encounter"]] = relationship(back_populates="patient")


class Encounter(Base):
    __tablename__ = "encounters"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    kind: Mapped[str] = mapped_column(String(20))
    patient: Mapped[Patient] = relationship(back_populates="encounters")


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)
statements: list[str] = []
event.listen(engine, "before_cursor_execute", lambda conn, cur, stmt, *args: statements.append(stmt))

with Session(engine) as session:
    session.add_all(
        Patient(name=name, encounters=[Encounter(kind="office"), Encounter(kind="er")]) for name in ["A", "B", "C"]
    )
    session.commit()


def count_queries(stmt) -> int:
    statements.clear()
    with Session(engine) as session:
        for patient in session.scalars(stmt).unique():
            assert len(patient.encounters) == 2   # touch the relationship, as a template or serializer would
    return len(statements)


assert count_queries(select(Patient)) == 4                                           # 1 + N: the N+1 problem
assert count_queries(select(Patient).options(selectinload(Patient.encounters))) == 2  # parents, then one IN query
assert count_queries(select(Patient).options(joinedload(Patient.encounters))) == 1    # one LEFT OUTER JOIN
```

With 3 patients the difference is small; with a page of 100 patients the lazy version runs 101 queries.

### selectinload vs joinedload vs raiseload: when do you use each? {deep}

`joinedload` adds a `LEFT OUTER JOIN` to the same query: best for many-to-one or one-to-one (an encounter's patient), because it does not multiply rows. For collections it repeats the parent columns for every child, and with `LIMIT` the ORM has to wrap the query in a subquery, so it can get expensive. `selectinload` runs a second query `WHERE parent_id IN (...)` for all parents at once: the usual best choice for one-to-many collections. `raiseload` makes any unplanned lazy load raise an error, which is a great way to forbid N+1 in API code, and `lazy="raise"` can be set on the relationship itself.

Also worth naming: `subqueryload` (older, mostly replaced by `selectinload`), `contains_eager` (when you wrote the join yourself and want it to populate the relationship), and `load_only()` / `defer()` to skip large columns such as a document's raw text.

### How do you manage transactions with the Session? {core}

Use a context manager so the commit and rollback cannot be forgotten: `with Session(engine) as session, session.begin():` commits when the block ends normally and rolls back if an exception escapes. Keep transactions short, never hold one open across a network call to another service, and let exceptions roll back the whole unit of work so you never commit half a change.

```python
from sqlalchemy import CheckConstraint, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Claim(Base):
    __tablename__ = "claims"
    __table_args__ = (CheckConstraint("amount >= 0", name="amount_not_negative"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int]


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)

with Session(engine) as session, session.begin():   # commits on success
    session.add(Claim(status="pending", amount=180))

try:
    with Session(engine) as session, session.begin():
        session.add(Claim(status="pending", amount=200))
        session.add(Claim(status="pending", amount=-5))   # violates the CHECK constraint at flush
except Exception as error:
    assert "CHECK constraint failed" in str(error)

with Session(engine) as session:
    # The failed block rolled back completely: the 200 claim was not saved either.
    assert session.scalar(select(func.count()).select_from(Claim)) == 1
```

### What does expire_on_commit do, and why does it matter in FastAPI? {deep}

By default, `commit()` expires every object in the session, so the next attribute access reloads fresh data from the database. That is safe, but if the session has already closed, the reload fails with `DetachedInstanceError`. This bites when code commits, closes the session and then reads the object: for example, an endpoint that opens its own `with Session(...)` block, commits inside it, and returns the ORM object for FastAPI to serialise after the block has closed.

Fixes: build the response (for example a Pydantic model with `from_attributes=True`) while the session is still open, call `session.refresh(obj)` before closing, or create sessions with `expire_on_commit=False` (common in web apps, and strongly recommended with `AsyncSession`, where an implicit reload on attribute access cannot happen).

```python
from sqlalchemy import String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.orm.exc import DetachedInstanceError


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)

with Session(engine) as session:
    patient = Patient(name="Aisha Khan")
    session.add(patient)
    session.commit()          # expires the object's attributes

try:
    patient.name              # needs a reload, but the session is closed
    raise AssertionError("expected DetachedInstanceError")
except DetachedInstanceError:
    pass

with Session(engine, expire_on_commit=False) as session:
    patient = Patient(name="Tom Brown")
    session.add(patient)
    session.commit()

assert patient.name == "Tom Brown"   # still loaded after the session closed
```

### How does connection pooling work, and which settings matter? {core}

Opening a database connection is expensive (TCP, TLS, authentication), so the engine keeps a pool and lends connections to sessions. The default `QueuePool` keeps `pool_size` connections open (5 by default) and allows `max_overflow` extra ones (10 by default) under bursts; requests wait up to `pool_timeout` seconds when all are busy. `pool_pre_ping=True` tests a connection before use so dropped connections (after a database failover or idle timeout) do not surface as errors, and `pool_recycle` replaces connections older than a given age.

Sizing matters: total connections = pool size × worker processes × replicas, and that must stay under the database's `max_connections`. With many replicas (Kubernetes, Cloud Run), put PgBouncer or a managed pooler in front of PostgreSQL.

```python norun
engine = create_engine(
    "postgresql+psycopg://app:secret@db:5432/claims",
    pool_size=10,
    max_overflow=5,
    pool_timeout=30,
    pool_pre_ping=True,
    pool_recycle=1800,
)
```

### How do you give each FastAPI request its own session? {core}

Write a dependency that yields a session and closes it afterwards, and inject it with `Depends`. Each request gets its own session (sessions are not thread-safe and must not be shared), the `finally` cleanup runs after the response, and tests swap the database with `app.dependency_overrides`.

```python
from collections.abc import Iterator

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict
from sqlalchemy import String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))


class PatientIn(BaseModel):
    name: str


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)   # read attributes from the ORM object
    id: int
    name: str


# In-memory SQLite shared across threads: TestClient runs sync endpoints in a thread pool.
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session   # closed after the response is sent


app = FastAPI()


@app.post("/patients", response_model=PatientOut, status_code=201)
def create_patient(body: PatientIn, session: Session = Depends(get_session)) -> Patient:
    patient = Patient(name=body.name)
    session.add(patient)
    session.commit()
    return patient


@app.get("/patients/{patient_id}", response_model=PatientOut)
def read_patient(patient_id: int, session: Session = Depends(get_session)) -> Patient:
    patient = session.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(404, "Patient not found")
    return patient


client = TestClient(app)
created = client.post("/patients", json={"name": "Maria Garcia"})
assert created.status_code == 201 and created.json() == {"id": 1, "name": "Maria Garcia"}
assert client.get("/patients/1").json()["name"] == "Maria Garcia"
assert client.get("/patients/99").status_code == 404
```

`StaticPool` with `check_same_thread=False` is a testing detail for in-memory SQLite only; in production you point the engine at PostgreSQL with a normal pool.

### How do you run raw SQL safely? {core}

Use `text()` with named bind parameters and pass the values separately; never format values into the SQL string. Bound parameters are sent apart from the SQL, so user input cannot change the query, and the driver handles quoting and types.

```python
from sqlalchemy import create_engine, text

engine = create_engine("sqlite://")
with engine.begin() as conn:
    conn.execute(text("CREATE TABLE patients (id INTEGER PRIMARY KEY, last_name TEXT)"))
    conn.execute(text("INSERT INTO patients (last_name) VALUES (:name)"), [{"name": "Garcia"}, {"name": "Lee"}])

with engine.connect() as conn:
    rows = conn.execute(text("SELECT id FROM patients WHERE last_name = :name"), {"name": "Lee"}).all()
    assert rows == [(2,)]
    injected = conn.execute(text("SELECT id FROM patients WHERE last_name = :name"), {"name": "x' OR '1'='1"}).all()
    assert injected == []   # treated as a literal value, not SQL
```

### How do you insert or update many rows efficiently? {deep}

Do not add 100,000 ORM objects one by one: each is tracked by the unit of work. Pass a list of dictionaries to `session.execute(insert(Model), rows)`, which the 2.0 ORM sends as a batched executemany ("insertmanyvalues" on PostgreSQL, which can also return generated IDs). For updates by primary key, `session.execute(update(Model), rows)` does the same. For truly huge loads into PostgreSQL, use `COPY` through the driver.

```python
from sqlalchemy import String, create_engine, func, insert, select, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Claim(Base):
    __tablename__ = "claims"
    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int]


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)

with Session(engine) as session:
    session.execute(insert(Claim), [{"id": i, "status": "pending", "amount": i * 10} for i in range(1, 1001)])
    session.execute(update(Claim), [{"id": 1, "status": "paid"}, {"id": 2, "status": "denied"}])  # bulk update by PK
    session.commit()
    assert session.scalar(select(func.count()).select_from(Claim)) == 1000
    assert session.scalar(select(Claim.status).where(Claim.id == 2)) == "denied"
```

### How do you manage schema changes? {core}

With Alembic, SQLAlchemy's migration tool. Each migration is a versioned Python script with `upgrade()` and `downgrade()`, stored in Git and applied in order, so every environment (Dev, SIT, UAT, Prod) reaches the same schema. `alembic revision --autogenerate` compares your models to the database and drafts a migration, which you must review: it misses renames (it sees a drop plus an add) and some constraint or type changes.

For zero-downtime deploys, use the expand-and-contract pattern: add the new nullable column, deploy code that writes both, backfill, switch reads, then drop the old column in a later release. Run migrations as a separate deployment step (a Kubernetes Job or a pipeline stage), not at app start-up on every replica.

```bash
alembic revision --autogenerate -m "add claims.denial_reason"
alembic upgrade head
alembic downgrade -1
```

```python norun
# alembic/versions/3f2a_add_denial_reason.py
def upgrade() -> None:
    op.add_column("claims", sa.Column("denial_reason", sa.String(50), nullable=True))
    op.create_index("ix_claims_denial_reason", "claims", ["denial_reason"])


def downgrade() -> None:
    op.drop_index("ix_claims_denial_reason", table_name="claims")
    op.drop_column("claims", "denial_reason")
```

### How does async SQLAlchemy differ? {deep}

You create an `AsyncEngine` with an async driver (`postgresql+asyncpg://`), use `AsyncSession`, and `await` every database call: `await session.execute(...)`, `await session.commit()`. The big rule is that implicit lazy loading cannot happen in async code, because attribute access cannot `await`; you must eager load (`selectinload`), use `await session.refresh(obj, ["encounters"])`, or the `AsyncAttrs` mixin's `await obj.awaitable_attrs.encounters`. Use `expire_on_commit=False` so committed objects stay readable.

```python norun
from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

# `app` and the `Patient` model are defined as in the earlier examples.

engine = create_async_engine("postgresql+asyncpg://app:secret@db/claims", pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session():
    async with SessionLocal() as session:
        yield session


@app.get("/patients/{patient_id}")
async def read_patient(patient_id: int, session: AsyncSession = Depends(get_session)):
    stmt = select(Patient).where(Patient.id == patient_id).options(selectinload(Patient.encounters))
    return (await session.execute(stmt)).scalar_one_or_none()
```

Async only pays off when the endpoint does other I/O concurrently or the service handles many slow concurrent requests; a plain `def` endpoint with a sync session runs in FastAPI's thread pool and is perfectly fine for most CRUD.

### How do you prevent lost updates when two users edit the same record? {deep}

Use optimistic locking: add a version column, include it in the `WHERE` of every `UPDATE`, and increment it. If another transaction changed the row first, the update matches zero rows and SQLAlchemy raises `StaleDataError`, which the API turns into `409 Conflict` (or `412` with ETags). Pessimistic locking (`select(...).with_for_update()`) locks the row instead, which suits short, high-contention operations such as decrementing a balance.

```python
from sqlalchemy import String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.orm.exc import StaleDataError


class Base(DeclarativeBase):
    pass


class Claim(Base):
    __tablename__ = "claims"
    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(20))
    version: Mapped[int] = mapped_column(nullable=False)
    __mapper_args__ = {"version_id_col": version}


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)
with Session(engine) as session:
    session.add(Claim(id=1, status="pending"))
    session.commit()

alice, bob = Session(engine), Session(engine)
alice_claim, bob_claim = alice.get(Claim, 1), bob.get(Claim, 1)
assert alice_claim.version == bob_claim.version == 1

alice_claim.status = "paid"
alice.commit()                       # UPDATE ... WHERE id = 1 AND version = 1  → version becomes 2

bob_claim.status = "denied"
try:
    bob.commit()                     # still sends version = 1, matches no row
    raise AssertionError("lost update was allowed")
except StaleDataError:
    bob.rollback()

with Session(engine) as session:
    assert session.get(Claim, 1).status == "paid"
alice.close()
bob.close()
```

### How do you write an upsert? {deep}

Use the dialect's insert construct: PostgreSQL's `INSERT … ON CONFLICT DO UPDATE` via `sqlalchemy.dialects.postgresql.insert(...).on_conflict_do_update(...)`, SQLite's equivalent from `sqlalchemy.dialects.sqlite`, or MySQL's `on_duplicate_key_update`. The conflict target must be a primary key or unique constraint, and `excluded` refers to the row you tried to insert. It is atomic, unlike "select, then insert or update", which races under concurrency.

```python
from sqlalchemy import String, create_engine, select
from sqlalchemy.dialects.sqlite import insert   # postgresql.insert has the same API
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Member(Base):
    __tablename__ = "members"
    member_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    plan: Mapped[str] = mapped_column(String(20))


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)


def upsert_members(session: Session, rows: list[dict]) -> None:
    stmt = insert(Member).values(rows)
    stmt = stmt.on_conflict_do_update(index_elements=[Member.member_id], set_={"plan": stmt.excluded.plan})
    session.execute(stmt)


with Session(engine) as session:
    upsert_members(session, [{"member_id": "M1", "plan": "HMO"}, {"member_id": "M2", "plan": "PPO"}])
    upsert_members(session, [{"member_id": "M2", "plan": "HMO"}, {"member_id": "M3", "plan": "EPO"}])
    session.commit()
    assert session.execute(select(Member.member_id, Member.plan).order_by(Member.member_id)).all() == [
        ("M1", "HMO"), ("M2", "HMO"), ("M3", "EPO"),
    ]
```

### What is the repository pattern, and is it worth it with SQLAlchemy? {deep}

A repository hides data access behind a domain-focused interface (`PatientRepository.find_by_member_id(...)`), so business logic does not build queries and can be tested with an in-memory fake. The `Session` itself already is a unit of work and an identity map, so a thin repository per aggregate plus the session as the transaction boundary is usually enough; avoid wrapping every SQLAlchemy feature in a generic repository that hides eager loading and makes performance tuning harder.

A pragmatic structure for FastAPI: routers (HTTP only) → services (business rules, transaction boundary) → repositories or query functions (SQLAlchemy), with Pydantic schemas at the edges.

### How does SQLAlchemy compare with Entity Framework?

They solve the same problem with similar ideas: EF Core's `DbContext` plays the role of the `Session` (unit of work, change tracking, identity resolution), `SaveChanges()` corresponds to `commit()`, `Include()` is eager loading like `selectinload`/`joinedload`, and EF migrations correspond to Alembic. Differences: SQLAlchemy exposes the SQL layer (Core) much more directly and has explicit loading strategies per query, while EF leans on LINQ.

**Your angle:** you used Entity Framework with SQL Server at Cognizant and PostgreSQL at Medidata. Mapping EF concepts to SQLAlchemy concepts shows you understand ORMs in general, not one library, and SQLAlchemy is the natural data layer for FastAPI services like the ones you built.

## Coding problems

### Fix the N+1 on a claims list endpoint {medium core}

A reporting function returns every claim with its patient's name and is slow in production. Write a test that counts SQL statements to prove the N+1, then fix the query so it uses a constant number of statements regardless of the number of claims.

#### Hints

1. Attach a `before_cursor_execute` event listener to the engine and record each statement.
2. Each `claim.patient` access lazy-loads a patient: that is the N.
3. Claim → patient is many-to-one, so `joinedload(Claim.patient)` is the natural fix.

#### Solution

Count statements around the function call. The lazy version issues one query for claims plus one per distinct patient (the identity map avoids reloading a patient it already has). With `joinedload`, everything comes back in one `LEFT OUTER JOIN`.

```python
from sqlalchemy import ForeignKey, String, create_engine, event, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, joinedload, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))


class Claim(Base):
    __tablename__ = "claims"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    amount: Mapped[int]
    patient: Mapped[Patient] = relationship()


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)
with Session(engine) as session:
    patients = [Patient(name=f"Patient {i}") for i in range(10)]
    session.add_all(patients)
    session.add_all(Claim(patient=patients[i % 10], amount=100 + i) for i in range(50))
    session.commit()

statements: list[str] = []
event.listen(engine, "before_cursor_execute", lambda conn, cur, stmt, *args: statements.append(stmt))


def report_slow(session: Session) -> list[tuple[int, str]]:
    return [(c.id, c.patient.name) for c in session.scalars(select(Claim).order_by(Claim.id))]


def report_fast(session: Session) -> list[tuple[int, str]]:
    stmt = select(Claim).options(joinedload(Claim.patient)).order_by(Claim.id)
    return [(c.id, c.patient.name) for c in session.scalars(stmt)]


def measure(report) -> tuple[list[tuple[int, str]], int]:
    statements.clear()
    with Session(engine) as session:
        rows = report(session)
    return rows, len(statements)


slow_rows, slow_count = measure(report_slow)
fast_rows, fast_count = measure(report_fast)
assert slow_rows == fast_rows and len(fast_rows) == 50
assert slow_count == 1 + 10   # one for claims, one per distinct patient
assert fast_count == 1        # constant, however many claims there are
```

If the report only needs two columns, a plain Core query is even cheaper because no ORM objects are built: `select(Claim.id, Patient.name).join(Claim.patient)`.

#### Follow-ups

- **How do you stop this regressing?** Keep the statement-count assertion in the test suite, or set `lazy="raise"` on relationships used by API code so accidental lazy loads fail loudly.
- **What if it were patient → claims (one-to-many)?** Use `selectinload`, to avoid repeating patient columns once per claim.

### Patient search with filters and pagination {medium}

Write `search_patients(session, name=None, state=None, limit=20, offset=0)` that filters optionally by a case-insensitive name fragment and an exact state, orders by last name then ID, and returns `(rows, total)` where `total` is the count before pagination.

#### Hints

1. Build a `select()` step by step, adding `.where()` only for the filters that were given.
2. `Patient.last_name.ilike(f"%{name}%")` is case-insensitive; the value is still a bound parameter.
3. For the total, wrap the filtered statement: `select(func.count()).select_from(stmt.subquery())`.

#### Solution

Compose the query from optional filters, count the filtered set with a subquery, then apply ordering, limit and offset for the page. A deterministic `ORDER BY` (last name plus ID) keeps pages stable.

```python
from sqlalchemy import Select, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(50))
    last_name: Mapped[str] = mapped_column(String(50), index=True)
    state: Mapped[str] = mapped_column(String(2))


def search_patients(
    session: Session, name: str | None = None, state: str | None = None, limit: int = 20, offset: int = 0
) -> tuple[list[Patient], int]:
    stmt: Select = select(Patient)
    if name:
        pattern = f"%{name}%"
        stmt = stmt.where(Patient.first_name.ilike(pattern) | Patient.last_name.ilike(pattern))
    if state:
        stmt = stmt.where(Patient.state == state)
    total = session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = session.scalars(stmt.order_by(Patient.last_name, Patient.id).limit(min(limit, 100)).offset(offset)).all()
    return list(rows), total or 0


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)
with Session(engine) as session:
    session.add_all([
        Patient(first_name="Maria", last_name="Garcia", state="CA"),
        Patient(first_name="James", last_name="Lee", state="CA"),
        Patient(first_name="Aisha", last_name="Khan", state="TX"),
        Patient(first_name="Leah", last_name="Morgan", state="CA"),
    ])
    session.commit()

    rows, total = search_patients(session, state="CA", limit=2)
    assert total == 3 and [p.last_name for p in rows] == ["Garcia", "Lee"]

    rows, total = search_patients(session, state="CA", limit=2, offset=2)
    assert total == 3 and [p.last_name for p in rows] == ["Morgan"]

    rows, total = search_patients(session, name="LE")                 # matches Lee and Leah, case-insensitive
    assert total == 2 and {p.first_name for p in rows} == {"James", "Leah"}

    assert search_patients(session, name="zzz") == ([], 0)
```

The page size is capped at 100 on the server, which is the "unrestricted resource consumption" defence from the API security chapter.

#### Follow-ups

- **Leading-wildcard `ILIKE` cannot use a B-tree index.** In PostgreSQL, add a trigram GIN index (`pg_trgm`) or use full-text search.
- **The count query is slow on big tables.** Return `has_more` (fetch `limit + 1`) instead of an exact total, or switch to keyset pagination.

### Sync a nightly eligibility feed with an upsert {medium}

Each night a payer sends the full list of active members as `[{"member_id", "plan", "status"}]`. Write `sync_members(session, feed)` that inserts new members, updates changed ones, and marks members missing from the feed as `"inactive"` (never deletes them), returning counts of inserted, updated and deactivated rows.

#### Hints

1. Load the existing members into a dict keyed by `member_id` (one query), then compare in Python; or use a dialect upsert for the insert-or-update part.
2. Only count a row as updated if a value actually changed.
3. Deactivate with one bulk `update()` using `where(Member.member_id.not_in(feed_ids))`.

#### Solution

Compare the feed with one query's worth of existing rows: new IDs are inserted, existing IDs with different values are updated through the unit of work, and one bulk `UPDATE` deactivates everyone not in the feed. Everything happens in one transaction, so a failure leaves yesterday's data intact.

```python
from sqlalchemy import String, create_engine, select, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Member(Base):
    __tablename__ = "members"
    member_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    plan: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))


def sync_members(session: Session, feed: list[dict]) -> dict[str, int]:
    existing = {m.member_id: m for m in session.scalars(select(Member))}
    inserted = updated = 0
    for row in feed:
        member = existing.get(row["member_id"])
        if member is None:
            session.add(Member(**row))
            inserted += 1
        elif (member.plan, member.status) != (row["plan"], row["status"]):
            member.plan, member.status = row["plan"], row["status"]
            updated += 1
    feed_ids = [row["member_id"] for row in feed]
    result = session.execute(
        update(Member)
        .where(Member.member_id.not_in(feed_ids), Member.status != "inactive")
        .values(status="inactive")
        .execution_options(synchronize_session="fetch")
    )
    return {"inserted": inserted, "updated": updated, "deactivated": result.rowcount}


engine = create_engine("sqlite://")
Base.metadata.create_all(engine)

with Session(engine) as session, session.begin():
    first = sync_members(session, [
        {"member_id": "M1", "plan": "HMO", "status": "active"},
        {"member_id": "M2", "plan": "PPO", "status": "active"},
    ])
assert first == {"inserted": 2, "updated": 0, "deactivated": 0}

with Session(engine) as session, session.begin():
    second = sync_members(session, [
        {"member_id": "M2", "plan": "HMO", "status": "active"},   # plan changed
        {"member_id": "M3", "plan": "EPO", "status": "active"},   # new
    ])                                                             # M1 missing → inactive
assert second == {"inserted": 1, "updated": 1, "deactivated": 1}

with Session(engine) as session:
    assert session.execute(select(Member.member_id, Member.plan, Member.status).order_by(Member.member_id)).all() == [
        ("M1", "HMO", "inactive"), ("M2", "HMO", "active"), ("M3", "EPO", "active"),
    ]
    # Running the same feed again changes nothing: the sync is idempotent.
    assert sync_members(session, [
        {"member_id": "M2", "plan": "HMO", "status": "active"},
        {"member_id": "M3", "plan": "EPO", "status": "active"},
    ]) == {"inserted": 0, "updated": 0, "deactivated": 0}
```

Complexity: O(n) over the feed plus existing rows, with three round trips (load, flush, bulk update) instead of one per member.

#### Follow-ups

- **The feed has two million members.** Load the feed into a staging table with `COPY`, then do the insert, update and deactivate as three set-based SQL statements (`INSERT … ON CONFLICT`, `UPDATE … FROM staging`, `UPDATE … WHERE NOT EXISTS`).
- **What if tonight's file is empty or truncated?** This code would deactivate everyone (`NOT IN` an empty list matches every row). Guard it: validate the record count against yesterday's, and refuse to deactivate more than a set share of members without a human approving it.
- **How do you audit changes?** Write a history row per change (who, when, old and new values), or use temporal tables or change data capture; eligibility history matters for claims adjudication.
