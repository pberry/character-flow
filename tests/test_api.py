import pytest

from app import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(str(tmp_path / "test.db"))
    app.config["TESTING"] = True
    return app.test_client()


SAMPLE = {
    "character": {"name": "Brakka", "abilities": [{"name": "STR", "score": 16}]},
    "boxes": [{"id": "b1", "x": 10, "y": 20, "w": 160, "h": 70, "text": "Rage?", "color": "#fde68a"}],
    "edges": [],
}


def test_empty_list(client):
    assert client.get("/api/charts").get_json() == []


def test_create_and_get_round_trip(client):
    resp = client.post("/api/charts", json={"name": "Brakka", "data": SAMPLE})
    assert resp.status_code == 201
    chart = resp.get_json()
    assert chart["name"] == "Brakka"
    fetched = client.get(f"/api/charts/{chart['id']}").get_json()
    assert fetched["data"] == SAMPLE


def test_create_requires_name(client):
    assert client.post("/api/charts", json={"name": "  "}).status_code == 400
    assert client.post("/api/charts", json={}).status_code == 400


def test_duplicate_name_conflict(client):
    client.post("/api/charts", json={"name": "Brakka"})
    assert client.post("/api/charts", json={"name": "Brakka"}).status_code == 409


def test_update_data_and_rename(client):
    cid = client.post("/api/charts", json={"name": "A"}).get_json()["id"]
    resp = client.put(f"/api/charts/{cid}", json={"data": SAMPLE})
    assert resp.get_json()["data"] == SAMPLE
    resp = client.put(f"/api/charts/{cid}", json={"name": "B"})
    assert resp.get_json()["name"] == "B"
    assert resp.get_json()["data"] == SAMPLE


def test_rename_conflict(client):
    client.post("/api/charts", json={"name": "A"})
    cid = client.post("/api/charts", json={"name": "B"}).get_json()["id"]
    assert client.put(f"/api/charts/{cid}", json={"name": "A"}).status_code == 409


def test_update_missing(client):
    assert client.put("/api/charts/999", json={"data": {}}).status_code == 404


def test_delete(client):
    cid = client.post("/api/charts", json={"name": "A"}).get_json()["id"]
    assert client.delete(f"/api/charts/{cid}").status_code == 204
    assert client.get(f"/api/charts/{cid}").status_code == 404
    assert client.delete(f"/api/charts/{cid}").status_code == 404


def test_copy(client):
    cid = client.post("/api/charts", json={"name": "A", "data": SAMPLE}).get_json()["id"]
    resp = client.post(f"/api/charts/{cid}/copy", json={"name": "A copy"})
    assert resp.status_code == 201
    assert resp.get_json()["data"] == SAMPLE
    assert client.post(f"/api/charts/{cid}/copy", json={"name": "A"}).status_code == 409


def test_list_is_summary_only(client):
    client.post("/api/charts", json={"name": "A", "data": SAMPLE})
    client.post("/api/charts", json={"name": "B"})
    listing = client.get("/api/charts").get_json()
    assert {c["name"] for c in listing} == {"A", "B"}
    assert all("data" not in c for c in listing)


def test_index_served(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Character Flow" in resp.data
