"""JSON API and static index.

There is no chart list: a chart is reached only by its edit key (read and
write) or its view key (read and copy). Unknown keys are a plain 404, so the
API never confirms whether a key exists.
"""

from flask import Blueprint, current_app, g, jsonify, redirect, request

from . import db

bp = Blueprint("main", __name__)

SECURITY_HEADERS = {
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    # print.js sets the @page size in a <style> element, so inline styles stay allowed.
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
}


def get_conn():
    if "conn" not in g:
        g.conn = db.connect(current_app.config["DB_PATH"])
    return g.conn


@bp.teardown_app_request
def close_conn(_exc):
    conn = g.pop("conn", None)
    if conn is not None:
        conn.close()


@bp.before_app_request
def drop_www():
    if request.host.startswith("www."):
        return redirect(request.url.replace("://www.", "://", 1), code=301)


@bp.after_app_request
def security_headers(resp):
    for name, value in SECURITY_HEADERS.items():
        resp.headers.setdefault(name, value)
    return resp


def error(message, status):
    return jsonify({"error": message}), status


@bp.app_errorhandler(413)
def too_large(_e):
    return error("chart is too large", 413)


def _clean_name(value):
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def editable(chart, edit_key):
    """What the edit-link holder sees: everything but the internal id."""
    out = {k: v for k, v in chart.items() if k != "id"}
    out["edit_key"] = edit_key
    return out


def viewable(chart):
    """What a view-link holder sees: no keys."""
    return {k: chart[k] for k in ("name", "data", "updated_at")}


def _create(name, data):
    conn = get_conn()
    if db.count_charts(conn) >= current_app.config["MAX_CHARTS"]:
        return error("this server is full; please try again later", 503)
    chart = db.create_chart(conn, name, data)
    return jsonify(editable(chart, chart["edit_key"])), 201


@bp.get("/")
def index():
    return current_app.send_static_file("index.html")


@bp.get("/healthz")
def healthz():
    get_conn().execute("SELECT 1")
    return "ok"


@bp.post("/api/charts")
def create_chart():
    body = request.get_json(silent=True) or {}
    name = _clean_name(body.get("name"))
    if name is None:
        return error("name is required", 400)
    data = body.get("data", {})
    if not isinstance(data, dict):
        return error("data must be an object", 400)
    return _create(name, data)


@bp.get("/api/edit/<key>")
def get_chart(key):
    chart = db.get_by_edit_key(get_conn(), key)
    if chart is None:
        return error("not found", 404)
    return jsonify(editable(chart, key))


@bp.put("/api/edit/<key>")
def update_chart(key):
    body = request.get_json(silent=True) or {}
    name = None
    if "name" in body:
        name = _clean_name(body["name"])
        if name is None:
            return error("name cannot be empty", 400)
    data = body.get("data")
    if data is not None and not isinstance(data, dict):
        return error("data must be an object", 400)
    chart = db.update_chart(get_conn(), key, name=name, data=data)
    if chart is None:
        return error("not found", 404)
    return jsonify(editable(chart, key))


@bp.delete("/api/edit/<key>")
def delete_chart(key):
    if not db.delete_chart(get_conn(), key):
        return error("not found", 404)
    return "", 204


@bp.get("/api/view/<key>")
def view_chart(key):
    chart = db.get_by_view_key(get_conn(), key)
    if chart is None:
        return error("not found", 404)
    return jsonify(viewable(chart))


@bp.post("/api/view/<key>/copy")
def copy_chart(key):
    body = request.get_json(silent=True) or {}
    name = _clean_name(body.get("name"))
    if name is None:
        return error("name is required", 400)
    source = db.get_by_view_key(get_conn(), key)
    if source is None:
        return error("not found", 404)
    return _create(name, source["data"])
