import re
from pathlib import Path

DOCKERFILE = (Path(__file__).parent.parent / "Dockerfile").read_text()


def test_litestream_hashes_pinned_for_each_arch():
    for arch in ("X86_64", "ARM64"):
        assert re.search(rf"^ARG LITESTREAM_SHA256_{arch}=[0-9a-f]{{64}}$", DOCKERFILE, re.M)


def test_litestream_download_checked_before_extract():
    check = DOCKERFILE.index("sha256sum -c -")
    assert DOCKERFILE.index("urlretrieve") < check < DOCKERFILE.index("tar -xzf /tmp/litestream.tar.gz")
