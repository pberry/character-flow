"""Character Flow: a combat flowchart builder for a single character."""

import os

from flask import Flask

from . import db
from .routes import bp


def create_app(db_path=None, max_charts=None):
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config["DB_PATH"] = db_path or os.environ.get("CHARFLOW_DB", "charflow.db")
    # Bounds disk use on a public server: one request body, and the whole database.
    app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
    app.config["MAX_CHARTS"] = max_charts or int(os.environ.get("CHARFLOW_MAX_CHARTS", 5000))
    db.init(app.config["DB_PATH"], wal=os.environ.get("CHARFLOW_WAL") == "1")
    app.register_blueprint(bp)
    return app
