"""A per-client limit on new charts, counted in memory.

Fly runs one machine with one worker, so an in-process count sees every
request. With more workers each keeps its own count, which only loosens the
limit. A stopped machine forgets its counts, but it only stops when idle.
"""

import math
import threading
import time
from collections import deque

# Past this many tracked clients, forget the ones with no recent hits.
SWEEP_AT = 10_000


class RateLimiter:
    """At most `limit` hits per key in any `window` seconds (a sliding window)."""

    def __init__(self, limit, window, clock=time.monotonic):
        self.limit = limit
        self.window = window
        self._clock = clock
        self._hits = {}
        self._lock = threading.Lock()

    def hit(self, key):
        """Record a hit for key. Returns 0 if allowed, else whole seconds to wait.

        Refused hits aren't recorded, so a client that keeps retrying isn't
        locked out for longer.
        """
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return max(1, math.ceil(hits[0] + self.window - now))
            hits.append(now)
            if len(self._hits) > SWEEP_AT:
                self._sweep(now)
            return 0

    def _sweep(self, now):
        stale = [k for k, hits in self._hits.items() if hits[-1] <= now - self.window]
        for key in stale:
            del self._hits[key]

    def __len__(self):
        return len(self._hits)
