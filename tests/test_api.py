import pytest

from app import create_app
from app.routes import MAX_DEPTH


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
        csp = resp.headers["Content-Security-Policy"]
        assert "default-src 'self'" in csp
        assert "base-uri 'none'" in csp and "form-action 'self'" in csp and "object-src 'none'" in csp


def test_hsts_only_over_https(client):
    assert "Strict-Transport-Security" not in client.get("/").headers
    secure = client.get("/", headers={"X-Forwarded-Proto": "https"})
    assert secure.headers["Strict-Transport-Security"] == "max-age=31536000"


def test_api_responses_are_not_cached(client):
    chart = create(client)
    for resp in (
        client.get(f"/api/edit/{chart['edit_key']}"),
        client.get(f"/api/view/{chart['view_key']}"),
        client.get("/api/edit/nope"),
    ):
        assert resp.headers["Cache-Control"] == "no-store"
    assert client.get("/").headers.get("Cache-Control") != "no-store"


@pytest.mark.parametrize("body", ["[1]", '"x"', "3"])
def test_non_object_body_is_400(client, body):
    chart = create(client)
    for method, url in (
        ("post", "/api/charts"),
        ("put", f"/api/edit/{chart['edit_key']}"),
        ("post", f"/api/view/{chart['view_key']}/copy"),
    ):
        resp = getattr(client, method)(url, data=body, content_type="application/json")
        assert resp.status_code == 400
        assert resp.get_json() == {"error": "body must be a JSON object"}


def nested(depth):
    """A chart body whose deepest list sits `depth` levels down (the body itself is level 1)."""
    lists = depth - 2
    return f'{{"name":"A","data":{{"x":{"[" * lists}{"]" * lists}}}}}'


def test_nesting_up_to_the_limit_is_allowed(client):
    resp = client.post("/api/charts", data=nested(MAX_DEPTH), content_type="application/json")
    assert resp.status_code == 201


@pytest.mark.parametrize("depth", [MAX_DEPTH + 1, 100_000])
def test_deeply_nested_json_is_400_not_500(client, depth):
    # 100,000 levels hits Python's parser limit on some versions and parses on others; both are refused.
    chart = create(client)
    for method, url in (
        ("post", "/api/charts"),
        ("put", f"/api/edit/{chart['edit_key']}"),
        ("post", f"/api/view/{chart['view_key']}/copy"),
    ):
        resp = getattr(client, method)(url, data=nested(depth), content_type="application/json")
        assert resp.status_code == 400
        assert resp.get_json() == {"error": "JSON is nested too deeply"}


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


def test_www_redirect_keeps_https_behind_a_proxy(client):
    resp = client.get("/", base_url="http://www.characterflow.app", headers={"X-Forwarded-Proto": "https"})
    assert resp.status_code == 301
    assert resp.headers["Location"] == "https://characterflow.app/"


def test_www_redirect_keeps_the_query(client):
    resp = client.get("/?a=1&b=2", base_url="https://www.characterflow.app")
    assert resp.headers["Location"] == "https://characterflow.app/?a=1&b=2"


def test_www_redirect_ignores_other_hosts(client):
    # The Host header must not choose where visitors are sent.
    resp = client.get("/", base_url="https://www.evil.example")
    assert resp.status_code == 200


def test_www_redirect_follows_base_url(client, app):
    app.config["BASE_URL"] = "https://flow.example.org"
    resp = client.get("/x", base_url="http://www.flow.example.org")
    assert resp.status_code == 301
    assert resp.headers["Location"] == "https://flow.example.org/x"
    assert client.get("/", base_url="https://www.characterflow.app").status_code == 200
