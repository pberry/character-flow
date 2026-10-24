import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from check_litestream import DOCKERFILE, main, newer_version, pinned_version  # noqa: E402

PINNED = pinned_version(DOCKERFILE.read_text())


def test_reads_pinned_version_from_dockerfile():
    assert PINNED == "0.5.17"


def test_missing_version_arg_is_an_error():
    with pytest.raises(ValueError):
        pinned_version("FROM python:3.14-slim\n")


def test_same_version_is_not_newer():
    assert newer_version(DOCKERFILE.read_text(), f"v{PINNED}") is None


def test_different_version_is_reported_without_v():
    assert newer_version("ARG LITESTREAM_VERSION=0.5.17\n", "v0.5.18") == "0.5.18"


def test_main_prints_github_output_line(capsys):
    assert main(["check_litestream.py", "v9.9.9"]) == 0
    assert capsys.readouterr().out == "latest=9.9.9\n"


def test_main_prints_nothing_when_current(capsys):
    assert main(["check_litestream.py", f"v{PINNED}"]) == 0
    assert capsys.readouterr().out == ""
