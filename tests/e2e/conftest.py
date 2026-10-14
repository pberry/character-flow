import threading

import pytest
from werkzeug.serving import make_server

from app import create_app


@pytest.fixture
def live_server(tmp_path):
    app = create_app(str(tmp_path / "e2e.db"))
    server = make_server("127.0.0.1", 0, app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
