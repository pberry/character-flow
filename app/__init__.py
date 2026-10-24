"""Character Flow: a combat flowchart builder for a single character."""

import os

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from . import db
from .admin import DEFAULT_BASE_URL
from .ratelimit import RateLimiter
from .routes import bp


def create_app(db_path=None, max_charts=None, create_limit=None, max_bytes=None):
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config["DB_PATH"] = db_path or os.environ.get("CHARFLOW_DB", "charflow.db")
    # Bounds disk use on a public server: one request body, the chart count, and the database's size.
    # The largest real chart is about 11 KB, so 128 KiB leaves room to grow.
    app.config["MAX_CONTENT_LENGTH"] = 128 * 1024
    app.config["MAX_CHARTS"] = max_charts or int(os.environ.get("CHARFLOW_MAX_CHARTS", 5000))
    # A quarter of Fly's 1 GB volume, leaving room for the WAL and Litestream's copy of it.
    app.config["MAX_BYTES"] = max_bytes or int(os.environ.get("CHARFLOW_MAX_BYTES", 256 * 1024 * 1024))
    # New charts (creates and copies) per client per hour, so one client can't fill MAX_CHARTS. 0 turns it off.
    if create_limit is None:
        create_limit = int(os.environ.get("CHARFLOW_CREATE_LIMIT", 20))
    app.extensions["create_limiter"] = RateLimiter(create_limit, 3600) if create_limit > 0 else None
    # Only trusted when set: Fly's proxy sets Fly-Client-IP, but elsewhere a client could send it.
    app.config["CLIENT_IP_HEADER"] = os.environ.get("CHARFLOW_CLIENT_IP_HEADER", "")
    # The public address: only its www. form is redirected, so the Host header can't pick the target.
    app.config["BASE_URL"] = os.environ.get("CHARFLOW_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    db.init(app.config["DB_PATH"], wal=os.environ.get("CHARFLOW_WAL") == "1")
    app.register_blueprint(bp)
    # Fly's proxy ends TLS and says so in X-Forwarded-Proto, so redirects keep https.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1)
    return app
