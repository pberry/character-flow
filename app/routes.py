"""JSON API and static index."""

from flask import Blueprint, current_app, g, jsonify, request

from . import db

bp = Blueprint("main", __name__)


def get_conn():
    if "conn" not in g:
        g.conn = db.connect(current_app.config["DB_PATH"])
    return g.conn


@bp.teardown_app_request
def close_conn(_exc):
    conn = g.pop("conn", None)
    if conn is not None:
        conn.close()


def error(message, status):
    return jsonify({"error": message}), status


def _clean_name(value):
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


@bp.get("/")
def index():
    return current_app.send_static_file("index.html")


@bp.get("/api/charts")
def list_charts():
    return jsonify(db.list_charts(get_conn()))


@bp.post("/api/charts")
def create_chart():
    body = request.get_json(silent=True) or {}
    name = _clean_name(body.get("name"))
    if name is None:
        return error("name is required", 400)
    data = body.get("data", {})
    if not isinstance(data, dict):
        return error("data must be an object", 400)
    try:
        chart = db.create_chart(get_conn(), name, data)
    except db.DuplicateName:
        return error(f"a chart named '{name}' already exists", 409)
    return jsonify(chart), 201


@bp.get("/api/charts/<int:chart_id>")
def get_chart(chart_id):
    chart = db.get_chart(get_conn(), chart_id)
    if chart is None:
        return error("not found", 404)
    return jsonify(chart)


@bp.put("/api/charts/<int:chart_id>")
def update_chart(chart_id):
    body = request.get_json(silent=True) or {}
    name = None
    if "name" in body:
        name = _clean_name(body["name"])
        if name is None:
            return error("name cannot be empty", 400)
    data = body.get("data")
    if data is not None and not isinstance(data, dict):
        return error("data must be an object", 400)
    try:
        chart = db.update_chart(get_conn(), chart_id, name=name, data=data)
    except db.DuplicateName:
        return error(f"a chart named '{name}' already exists", 409)
    if chart is None:
        return error("not found", 404)
    return jsonify(chart)


@bp.delete("/api/charts/<int:chart_id>")
def delete_chart(chart_id):
    if not db.delete_chart(get_conn(), chart_id):
        return error("not found", 404)
    return "", 204


@bp.post("/api/charts/<int:chart_id>/copy")
def copy_chart(chart_id):
    body = request.get_json(silent=True) or {}
    name = _clean_name(body.get("name"))
    if name is None:
        return error("name is required", 400)
    conn = get_conn()
    source = db.get_chart(conn, chart_id)
    if source is None:
        return error("not found", 404)
    try:
        chart = db.create_chart(conn, name, source["data"])
    except db.DuplicateName:
        return error(f"a chart named '{name}' already exists", 409)
    return jsonify(chart), 201
