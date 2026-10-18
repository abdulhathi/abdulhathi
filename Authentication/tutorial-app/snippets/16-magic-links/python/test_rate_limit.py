from rate_limit import RateLimiter


def test_allows_the_limit_then_refuses_until_the_oldest_request_leaves_the_window():
    now = [0.0]
    limiter = RateLimiter(3, 60, lambda: now[0])
    for t in (0, 10, 20):
        now[0] = t
        assert limiter.take("ada@example.com") == 0
    now[0] = 30
    assert limiter.take("ada@example.com") == 30  # the request at 0 leaves the window at 60
    now[0] = 60
    assert limiter.take("ada@example.com") == 0
    assert limiter.take("ada@example.com") == 10


def test_each_key_has_its_own_count():
    limiter = RateLimiter(1, 60, lambda: 0.0)
    assert limiter.take("ada@example.com") == 0
    assert limiter.take("bo@example.com") == 0
    assert limiter.take("ada@example.com") == 60
