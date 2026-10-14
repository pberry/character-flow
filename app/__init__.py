"""Character Flow: a combat flowchart builder for a single character."""

import os

from flask import Flask

from . import db
from .routes import bp


def create_app(db_path=None):
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    app.config["DB_PATH"] = db_path or os.environ.get("CHARFLOW_DB", "charflow.db")
    db.init(app.config["DB_PATH"])
    app.register_blueprint(bp)
    return app
