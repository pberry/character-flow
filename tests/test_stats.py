from datetime import date

import pytest

from app import create_app, db, stats


@pytest.fixture
def app(tmp_path):
    app = create_app(str(tmp_path / "test.db"), create_limit=0)
    app.config["TESTING"] = True
    app.config["STATS_TTL"] = 0
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def chart(cls="Monk", level=3, boxes=1, **extra):
    return {
        "character": {"name": "Secret Name", "class": cls, "level": level},
        "lanes": [{"id": "l1", "name": "Attack", "badges": [{"type": "cost", "text": "1 FP"}]}],
        "boxes": [{"id": f"b{i}", "text": "Private box text", "shape": "diamond" if i == 0 else "rect"}
                  for i in range(boxes)],
        "edges": [],
        **extra,
    }


def create(client, name, data):
    assert client.post("/api/charts", json={"name": name, "data": data}).status_code == 201


def compute(app):
    conn = db.connect(app.config["DB_PATH"])
    try:
        return stats.compute(conn)
    finally:
        conn.close()


def test_empty_server(client):
    resp = client.get("/stats")
    assert resp.status_code == 200
    assert b"No charts yet" in resp.data


def test_counts_charts_and_features(app, client):
    create(client, "A", chart(boxes=3, sidebar={"sections": []}, orientation="portrait",
                              edges=[{"id": "e1", "label": "yes"}], groups=[{"id": "g1", "boxes": ["b0"]}]))
    create(client, "B", chart(boxes=1))
    create(client, "Empty", {})
    s = compute(app)
    assert (s["total"], s["in_use"], s["last7"], s["last30"], s["active7"]) == (3, 2, 3, 3, 3)
    assert s["weekly"][-1]["count"] == 3 and len(s["weekly"]) == stats.WEEKS
    assert (s["total_boxes"], s["median_boxes"], s["median_lanes"]) == (4, 2, 1)
    features = {f["label"]: f["pct"] for f in s["features"]}
    assert features == {"Badges": 100, "Side column": 50, "Groups": 50, "Arrow labels": 50, "Portrait printing": 50}
    assert {r["label"]: r["count"] for r in s["shapes"]} == {"Rectangle": 2, "Diamond": 2}
    assert s["badges"] == [{"label": "Cost", "count": 2, "pct": 100}]


def test_levels_are_bucketed_and_checked(app, client):
    for level in (1, 5, "7", 20, 99, True, "x"):
        create(client, f"L{level}", chart(level=level))
    tiers = {t["label"]: t["count"] for t in compute(app)["tiers"]}
    assert tiers == {"Level 1–4": 1, "Level 5–10": 2, "Level 11–16": 0, "Level 17–20": 1}


def test_odd_data_is_skipped_not_fatal(app, client):
    create(client, "Odd", {"character": "nope", "boxes": [1, "x", {"shape": "<script>"}], "lanes": "x",
                           "sidebar": {"sections": [{"items": [{"badges": [{"type": "bogus"}]}]}]}, "groups": 7})
    s = compute(app)
    assert s["in_use"] == 1 and s["shapes"] == [] and s["badges"] == []
    assert client.get("/stats").status_code == 200


def test_page_shows_nothing_players_typed(client):
    for i in range(10):
        create(client, "Brakka the Bold", chart(cls="Barbarian", edges=[{"id": "e1", "label": "Only if raging"}]))
    html = client.get("/stats").get_data(as_text=True)
    assert "charts created" in html
    for secret in ("Brakka", "Barbarian", "Secret Name", "Private box text", "1 FP", "raging"):
        assert secret not in html


def test_weekly_buckets_by_monday():
    conn = db.connect(":memory:")
    conn.executescript(db.SCHEMA)
    for i, created in enumerate(["2026-10-19T09:00:00+00:00", "2026-10-25T23:00:00+00:00", "2026-10-12T00:00:00+00:00"]):
        conn.execute("INSERT INTO charts (name, edit_key_hash, view_key, data, created_at, updated_at)"
                     " VALUES ('x', ?, ?, '{}', ?, ?)", (f"h{i}", f"v{i}", created, created))
    s = stats.compute(conn, today=date(2026, 10, 25))
    assert [w["count"] for w in s["weekly"][-2:]] == [1, 2]
    assert s["weekly"][-1]["label"] == "Oct 19"
    assert s["last7"] == 2


def test_cached_until_ttl(app, client):
    app.config["STATS_TTL"] = 3600
    assert b"No charts yet" in client.get("/stats").data
    create(client, "A", chart())
    assert b"No charts yet" in client.get("/stats").data
