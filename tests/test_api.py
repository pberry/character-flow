import pytest

from app import create_app


@pytest.fixture
def app(tmp_path):
    app = create_app(str(tmp_path / "test.db"), max_charts=5)
    app.config["TESTING"] = True
    return app


@pytest.fixture
def client(app):
    return app.test_client()


SAMPLE = {
    "character": {"name": "Brakka", "abilities": [{"name": "STR", "score": 16}]},
    "boxes": [{"id": "b1", "x": 10, "y": 20, "w": 160, "h": 70, "text": "Rage?", "color": "#fde68a"}],
    "edges": [],
}


def create(client, name="A", data=None):
    resp = client.post("/api/charts", json={"name": name, "data": data or {}})
    assert resp.status_code == 201
    return resp.get_json()


def test_there_is_no_chart_list(client):
    create(client)
    assert client.get("/api/charts").status_code == 405


def test_create_returns_keys_not_id(client):
    chart = create(client, "Brakka", SAMPLE)
    assert chart["name"] == "Brakka"
    assert len(chart["edit_key"]) >= 22 and len(chart["view_key"]) >= 22
    assert chart["edit_key"] != chart["view_key"]
    assert "id" not in chart


def test_edit_round_trip(client):
    chart = create(client, "Brakka", SAMPLE)
    fetched = client.get(f"/api/edit/{chart['edit_key']}").get_json()
    assert fetched["data"] == SAMPLE
    assert fetched["view_key"] == chart["view_key"]
    assert fetched["edit_key"] == chart["edit_key"]
    assert "id" not in fetched


def test_create_requires_name(client):
    assert client.post("/api/charts", json={"name": "  "}).status_code == 400
    assert client.post("/api/charts", json={}).status_code == 400


def test_duplicate_names_allowed(client):
    a, b = create(client, "Brakka"), create(client, "Brakka")
    assert a["edit_key"] != b["edit_key"]


def test_update_data_and_rename(client):
    key = create(client)["edit_key"]
    resp = client.put(f"/api/edit/{key}", json={"data": SAMPLE})
    assert resp.get_json()["data"] == SAMPLE
    resp = client.put(f"/api/edit/{key}", json={"name": "B"})
    assert resp.get_json()["name"] == "B"
    assert resp.get_json()["data"] == SAMPLE
    assert client.put(f"/api/edit/{key}", json={"name": " "}).status_code == 400


def test_unknown_keys_are_404(client):
    assert client.get("/api/edit/nope").status_code == 404
    assert client.put("/api/edit/nope", json={"data": {}}).status_code == 404
    assert client.delete("/api/edit/nope").status_code == 404
    assert client.get("/api/view/nope").status_code == 404
    assert client.post("/api/view/nope/copy", json={"name": "x"}).status_code == 404


def test_view_key_is_read_only(client):
    chart = create(client, "A", SAMPLE)
    view = chart["view_key"]
    resp = client.get(f"/api/view/{view}")
    assert resp.get_json() == {"name": "A", "data": SAMPLE, "updated_at": chart["updated_at"]}
    # A view key can't be used as an edit key, and the view routes don't write.
    assert client.get(f"/api/edit/{view}").status_code == 404
    assert client.put(f"/api/edit/{view}", json={"name": "Defaced"}).status_code == 404
    assert client.delete(f"/api/edit/{view}").status_code == 404
    assert client.put(f"/api/view/{view}", json={"name": "Defaced"}).status_code == 405
    assert client.delete(f"/api/view/{view}").status_code == 405
    assert client.get(f"/api/edit/{chart['edit_key']}").get_json()["name"] == "A"


def test_delete(client):
    key = create(client)["edit_key"]
    assert client.delete(f"/api/edit/{key}").status_code == 204
    assert client.get(f"/api/edit/{key}").status_code == 404
    assert client.delete(f"/api/edit/{key}").status_code == 404


def test_copy_from_view_key(client):
    chart = create(client, "A", SAMPLE)
    resp = client.post(f"/api/view/{chart['view_key']}/copy", json={"name": "A copy"})
    assert resp.status_code == 201
    copy = resp.get_json()
    assert copy["data"] == SAMPLE
    assert copy["edit_key"] != chart["edit_key"]
    assert client.post(f"/api/view/{chart['view_key']}/copy", json={}).status_code == 400


def test_body_size_limit(client):
    big = {"notes": "x" * (1024 * 1024)}
    resp = client.post("/api/charts", json={"name": "A", "data": big})
    assert resp.status_code == 413
    assert resp.get_json() == {"error": "chart is too large"}


def test_chart_cap(client):
    for i in range(5):
        create(client, f"c{i}")
    resp = client.post("/api/charts", json={"name": "one more"})
    assert resp.status_code == 503
    assert resp.get_json()["error"].startswith("this server is full")


def test_security_headers(client):
    for resp in (client.get("/"), client.get("/api/view/nope")):
        assert resp.headers["Referrer-Policy"] == "no-referrer"
        assert resp.headers["X-Content-Type-Options"] == "nosniff"
        assert "default-src 'self'" in resp.headers["Content-Security-Policy"]


def test_healthz(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200 and resp.data == b"ok"


def test_index_served(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Character Flow" in resp.data


def test_www_redirects_to_bare_domain(client):
    resp = client.get("/static/favicon.svg", base_url="https://www.characterflow.app")
    assert resp.status_code == 301
    assert resp.headers["Location"] == "https://characterflow.app/static/favicon.svg"
