"""Say whether the Dockerfile's Litestream is behind the latest release.

    python3 scripts/check_litestream.py "$(gh release view -R benbjohnson/litestream --json tagName -q .tagName)"

Prints `latest=<version>` when the release tag differs from LITESTREAM_VERSION,
and nothing when they match, so the litestream.yml workflow can append the
output to $GITHUB_OUTPUT. Standard library only, so it runs without uv.
"""

import re
import sys
from pathlib import Path

DOCKERFILE = Path(__file__).resolve().parent.parent / "Dockerfile"


def pinned_version(dockerfile: str) -> str:
    match = re.search(r"^ARG LITESTREAM_VERSION=(\S+)$", dockerfile, re.M)
    if not match:
        raise ValueError("no ARG LITESTREAM_VERSION in the Dockerfile")
    return match.group(1)


def newer_version(dockerfile: str, latest_tag: str) -> str | None:
    """The latest version if it differs from the pinned one, else None."""
    latest = latest_tag.removeprefix("v")
    return None if latest == pinned_version(dockerfile) else latest


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    latest = newer_version(DOCKERFILE.read_text(), argv[1])
    if latest:
        print(f"latest={latest}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
