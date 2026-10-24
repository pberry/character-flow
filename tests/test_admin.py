from app import admin, db


def test_list_and_reset_link(tmp_path, capsys):
    path = tmp_path / "t.db"
    db.init(path)
    conn = db.connect(path)
    chart = db.create_chart(conn, "Meren", {"x": 1})
    conn.close()

    assert admin.main(["--db", str(path), "list"]) == 0
    assert "Meren" in capsys.readouterr().out

    assert admin.main(["--db", str(path), "reset-link", str(chart["id"]), "--base-url", "https://example.test/"]) == 0
    url = capsys.readouterr().out.strip()
    assert url.startswith("https://example.test/#/edit/")
    new_key = url.rsplit("/", 1)[-1]
    conn = db.connect(path)
    assert db.get_by_edit_key(conn, chart["edit_key"]) is None
    assert db.get_by_edit_key(conn, new_key)["data"] == {"x": 1}


def test_reset_link_unknown_id(tmp_path, capsys):
    path = tmp_path / "t.db"
    assert admin.main(["--db", str(path), "reset-link", "42"]) == 1
    assert "no chart" in capsys.readouterr().err
