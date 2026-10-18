import json

from fastapi.testclient import TestClient

from app import create_app
from sender import deliver, new_secret, sign, signature_header

T = 1_792_238_400  # 2026-10-17 12:00:00 UTC, the receiver's clock
secret = new_secret()


def start(secrets: list[str], now=lambda: T):
    """A receiver with its own replay cache."""
    app = create_app(secrets, now=now)
    return TestClient(app), app.state.received


client, received = start([secret])


def post(body: bytes, header: str | None = None, c: TestClient = client):
    headers = {"Content-Type": "application/json"}
    if header is not None:
        headers["Webhook-Signature"] = header
    return c.post("/webhooks/orders", content=body, headers=headers)


def event(event_id: str) -> bytes:
    return json.dumps({"id": event_id, "type": "order.paid", "data": {"orderId": "ord_1001", "amount": 4200}}, separators=(",", ":")).encode()


def test_a_correctly_signed_webhook_is_accepted():
    body = event("evt_1")
    r = post(body, signature_header([secret], T, body))
    assert r.status_code == 200
    assert r.json() == {"received": True, "type": "order.paid"}
    assert received[-1] == json.loads(body)


def test_deliver_sends_a_webhook_the_receiver_accepts():
    r = deliver(client, "/webhooks/orders", {"id": "evt_2", "type": "order.refunded"}, [secret], now=lambda: T)
    assert r.status_code == 200
    assert r.json() == {"received": True, "type": "order.refunded"}


def test_a_tampered_body_is_rejected():
    header = signature_header([secret], T, event("evt_3"))
    r = post(event("evt_3").replace(b"4200", b"1"), header)
    assert r.status_code == 400
    assert r.json() == {"error": "Signature does not match."}


def test_a_signature_made_with_the_wrong_secret_is_rejected():
    body = event("evt_4")
    r = post(body, signature_header([new_secret()], T, body))
    assert r.status_code == 400
    assert r.json() == {"error": "Signature does not match."}


def test_the_raw_bytes_are_checked_so_re_serialized_json_fails():
    body = event("evt_5")
    pretty = json.dumps(json.loads(body), indent=2).encode()  # the same data, different bytes
    assert post(pretty, signature_header([secret], T, body)).status_code == 400


def test_a_timestamp_more_than_5_minutes_off_is_rejected_even_with_a_valid_signature():
    for offset in (-301, 301):
        body = event(f"evt_6{offset}")
        r = post(body, signature_header([secret], T + offset, body))
        assert r.status_code == 400
        assert r.json() == {"error": "Timestamp outside the tolerance window."}
    body = event("evt_6")
    assert post(body, signature_header([secret], T - 300, body)).status_code == 200, "5 minutes exactly is still fine"


def test_moving_t_to_a_fresh_time_breaks_the_signature():
    body = event("evt_6b")
    old = signature_header([secret], T - 600, body)  # recorded 10 minutes ago
    r = post(body, old.replace(f"t={T - 600}", f"t={T}"))
    assert r.status_code == 400
    assert r.json() == {"error": "Signature does not match."}


def test_a_replayed_delivery_is_rejected_even_with_its_header_rewritten():
    body = event("evt_7")
    header = signature_header([secret], T, body)
    assert post(body, header).status_code == 200
    replay = post(body, header)
    assert replay.status_code == 409
    assert replay.json() == {"error": "This delivery was already received."}
    ts, v1 = header.split(",")
    for rewritten in (f"{ts}, {v1}", f"{v1},{ts}", f"{ts},{v1},{v1}", f"{ts},{v1},v0={'0' * 64}"):
        assert post(body, rewritten).status_code == 409, rewritten


def test_after_the_5_minutes_a_replay_is_stopped_by_the_timestamp_check_instead():
    clock = [T]
    receiver, _ = start([secret], now=lambda: clock[0])
    body = event("evt_7b")
    header = signature_header([secret], T, body)
    assert post(body, header, receiver).status_code == 200
    clock[0] += 301
    late = post(body, header, receiver)
    assert late.status_code == 400
    assert late.json() == {"error": "Timestamp outside the tolerance window."}


def test_a_missing_or_malformed_header_or_a_body_that_is_not_json_is_rejected():
    missing = post(event("evt_8"))
    assert missing.status_code == 400
    assert missing.json() == {"error": "Missing Webhook-Signature header."}
    good = sign(secret, T, event("evt_8"))
    for header in (
        "t=yesterday,v1=abc",
        f"v1={good}",  # no t
        f"t={T}",  # no v1
        f"t={T},v1={good[:40]}",  # the wrong length
        f"t={T},v0={good}",  # only a scheme this receiver does not know
        f"t={T}=0,v1={good}",  # junk after the timestamp
        f"t={'9' * 5000},v1={good}",  # a timestamp far too long
    ):
        malformed = post(event("evt_8"), header)
        assert malformed.status_code == 400, header[:40]
        assert malformed.json() == {"error": "Malformed Webhook-Signature header."}
    # The signature is checked before the body is parsed.
    forged = post(b"not json", signature_header([new_secret()], T, b"not json"))
    assert forged.json() == {"error": "Signature does not match."}
    for body in (b"not json", b"[1,2]", b'{"amount":NaN}'):
        not_json = post(body, signature_header([secret], T, body))
        assert not_json.status_code == 400, body
        assert not_json.json() == {"error": "Body is not a JSON object."}


def test_during_rotation_either_secret_is_accepted_and_a_replay_with_one_v1_removed_is_still_caught():
    old_secret, newer = new_secret(), new_secret()
    rotating, _ = start([newer, old_secret])
    from_old = event("evt_9a")
    assert post(from_old, signature_header([old_secret], T, from_old), rotating).status_code == 200
    from_new = event("evt_9b")
    assert post(from_new, signature_header([newer], T, from_new), rotating).status_code == 200
    from_other = event("evt_9c")
    assert post(from_other, signature_header([new_secret()], T, from_other), rotating).status_code == 400

    both = event("evt_9d")
    header = signature_header([newer, old_secret], T, both)  # t=...,v1=<new>,v1=<old>
    assert post(both, header, rotating).status_code == 200
    trimmed = ",".join(p for i, p in enumerate(header.split(",")) if i != 1)  # drop the first v1
    assert post(both, trimmed, rotating).status_code == 409


def test_the_body_is_read_whatever_the_content_type_even_none():
    body = event("evt_10")
    r = client.post("/webhooks/orders", content=body, headers={"Webhook-Signature": signature_header([secret], T, body)})
    assert r.status_code == 200
