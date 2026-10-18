from documents import SEED, USERS
from policy import can
from tokens import FULL_ACCESS, User


def user(name: str) -> User:
    c = USERS[name]
    return User(id=c["sub"], tenant=c["tenant"], roles=tuple(c["roles"]), department=c["department"],
                scopes=tuple(FULL_ACCESS.split(" ")))


def doc(doc_id: str):
    return next(d for d in SEED if d.id == doc_id)


def test_the_read_rule_published_for_everyone_in_the_tenant_drafts_for_the_owner_editors_and_admins():
    assert can(user("bo"), "read", doc("d2"))  # published
    assert not can(user("bo"), "read", doc("d1"))  # a viewer and someone else's draft
    assert can(user("ada"), "read", doc("d1"))  # the owner
    assert can(user("cy"), "read", doc("d1"))  # an editor
    assert can(user("di"), "read", doc("d1"))  # an admin


def test_the_publish_rule_needs_an_editor_in_the_documents_department_or_an_admin():
    assert can(user("ada"), "publish", doc("d1"))  # sales editor, sales document
    assert not can(user("cy"), "publish", doc("d1"))  # support editor, sales document
    assert not can(user("bo"), "publish", doc("d1"))  # a viewer, even in sales
    assert can(user("di"), "publish", doc("d3"))  # an admin


def test_update_is_for_the_owner_or_an_admin_and_delete_for_admins_only():
    assert can(user("ada"), "update", doc("d1"))  # the owner
    assert not can(user("cy"), "update", doc("d1"))  # an editor, but not the owner
    assert can(user("di"), "update", doc("d1"))  # an admin
    assert not can(user("ada"), "delete", doc("d1"))  # the owner, but not an admin
    assert can(user("di"), "delete", doc("d1"))  # an admin


def test_another_tenant_gets_nothing_not_even_an_admin():
    for action in ("read", "update", "publish", "delete"):
        assert not can(user("eve"), action, doc("d1")), action
        assert not can(user("di"), action, doc("d4")), action
