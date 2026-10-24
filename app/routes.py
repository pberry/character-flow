"""JSON API, static index, and static pages.

There is no chart list: a chart is reached only by its edit key (read and
write) or its view key (read and copy). Unknown keys are a plain 404, so the
API never confirms whether a key exists.
"""

import math
import re
from urllib.parse import urlsplit

from flask import Blueprint, abort, current_app, g, jsonify, make_response, redirect, render_template, request
from jinja2 import TemplateNotFound

from . import db, stats

bp = Blueprint("main", __name__)

# Page slugs are plain names, so a URL can never reach outside templates/pages/.
PAGE_SLUG = re.compile(r"[a-z0-9-]+")

SECURITY_HEADERS = {
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    # print.js sets the @page size in a <style> element, so inline styles stay allowed.
    "Content-Security-Policy": (
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none';"
        " base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    ),
}
# Only sent over https, so plain-http Docker on a LAN isn't pinned to https.
HSTS = "max-age=31536000"


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
    base = current_app.config["BASE_URL"]
    if request.host == "www." + urlsplit(base).netloc:
        query = request.query_string.decode()
        return redirect(base + request.path + (f"?{query}" if query else ""), code=301)


@bp.after_app_request
def security_headers(resp):
    for name, value in SECURITY_HEADERS.items():
        resp.headers.setdefault(name, value)
    if request.is_secure:
        resp.headers.setdefault("Strict-Transport-Security", HSTS)
    # Edit responses carry the edit key, so no API response is cached.
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def error(message, status):
    return jsonify({"error": message}), status


@bp.app_errorhandler(413)
def too_large(_e):
    return error("chart is too large", 413)


# Real charts nest about 7 levels deep. Python's own parser limit depends on the
# version and the C stack, so this one is enforced explicitly.
MAX_DEPTH = 64


def _too_deep(value):
    """Whether lists and objects in `value` nest deeper than MAX_DEPTH, checked
    without recursion."""
    stack = [(value, 1)]
    while stack:
        v, depth = stack.pop()
        if isinstance(v, (dict, list)):
            if depth > MAX_DEPTH:
                return True
            stack.extend((child, depth + 1) for child in (v.values() if isinstance(v, dict) else v))
    return False


def json_body():
    """The request's JSON object, or {} without one. A body that isn't an object,
    or nests deeper than MAX_DEPTH, is a 400, not a 500."""
    try:
        body = request.get_json(silent=True)
    except RecursionError:
        body = None
        too_deep = True
    else:
        too_deep = _too_deep(body)
    if too_deep:
        abort(make_response(error("JSON is nested too deeply", 400)))
    if body is not None and not isinstance(body, dict):
        abort(make_response(error("body must be a JSON object", 400)))
    return body or {}


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


def client_ip():
    """The caller's address: from the proxy's header when one is configured
    (Fly-Client-IP on Fly), else the connection. Clients can't set it otherwise."""
    header = current_app.config["CLIENT_IP_HEADER"]
    return (header and request.headers.get(header)) or request.remote_addr


def _create(name, data):
    limiter = current_app.extensions["create_limiter"]
    if limiter is not None:
        wait = limiter.hit(client_ip())
        if wait:
            minutes = math.ceil(wait / 60)
            resp, status = error(
                f"too many new charts from your network; please try again in {minutes} minute{'s' * (minutes != 1)}", 429)
            resp.headers["Retry-After"] = str(wait)
            return resp, status
    conn = get_conn()
    if db.count_charts(conn) >= current_app.config["MAX_CHARTS"]:
        return error("this server is full; please try again later", 503)
    chart = db.create_chart(conn, name, data)
    return jsonify(editable(chart, chart["edit_key"])), 201


@bp.get("/")
def index():
    return current_app.send_static_file("index.html")


@bp.get("/stats")
def stats_page():
    """Anonymous counts across all charts (see stats.py)."""
    return render_template("stats.html", stats=stats.cached(current_app, get_conn()))


@bp.get("/<slug>")
def page(slug):
    """A static page: app/templates/pages/<slug>.html, wrapped in base.html."""
    if not PAGE_SLUG.fullmatch(slug):
        abort(404)
    try:
        return render_template(f"pages/{slug}.html")
    except TemplateNotFound:
        abort(404)


@bp.get("/healthz")
def healthz():
    get_conn().execute("SELECT 1")
    return "ok"


@bp.post("/api/charts")
def create_chart():
    body = json_body()
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
    body = json_body()
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
    body = json_body()
    name = _clean_name(body.get("name"))
    if name is None:
        return error("name is required", 400)
    source = db.get_by_view_key(get_conn(), key)
    if source is None:
        return error("not found", 404)
    return _create(name, source["data"])
