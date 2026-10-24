from app.ratelimit import RateLimiter


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_allows_up_to_the_limit_then_refuses():
    limiter = RateLimiter(3, 60, clock=Clock())
    assert [limiter.hit("a") for _ in range(3)] == [0, 0, 0]
    assert limiter.hit("a") == 60


def test_window_slides():
    clock = Clock()
    limiter = RateLimiter(2, 60, clock=clock)
    limiter.hit("a")
    clock.now += 30
    limiter.hit("a")
    clock.now += 20
    assert limiter.hit("a") == 10  # the first hit expires in 10s
    clock.now += 10
    assert limiter.hit("a") == 0
    assert limiter.hit("a") == 30  # now waiting on the second hit


def test_refused_hits_are_not_counted():
    clock = Clock()
    limiter = RateLimiter(1, 60, clock=clock)
    limiter.hit("a")
    for _ in range(5):
        clock.now += 10
        limiter.hit("a")
    clock.now += 10
    assert limiter.hit("a") == 0


def test_wait_is_at_least_one_second():
    clock = Clock()
    limiter = RateLimiter(1, 60, clock=clock)
    limiter.hit("a")
    clock.now += 59.9
    assert limiter.hit("a") == 1


def test_keys_are_separate():
    limiter = RateLimiter(1, 60, clock=Clock())
    assert limiter.hit("a") == 0
    assert limiter.hit("b") == 0
    assert limiter.hit("a") > 0


def test_idle_clients_are_forgotten(monkeypatch):
    monkeypatch.setattr("app.ratelimit.SWEEP_AT", 3)
    clock = Clock()
    limiter = RateLimiter(5, 60, clock=clock)
    for key in "abc":
        limiter.hit(key)
    clock.now += 61
    limiter.hit("d")
    limiter.hit("e")
    assert len(limiter) == 2
