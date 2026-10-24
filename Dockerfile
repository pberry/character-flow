FROM python:3.14-slim@sha256:35caba83af2fe6da9a5d922f9b0156f21d1246a48278c58a08bd253303ba42e8

COPY --from=ghcr.io/astral-sh/uv:0.11.14@sha256:1025398289b62de8269e70c45b91ffa37c373f38118d7da036fb8bb8efc85d97 /uv /bin/uv

# Litestream streams the database to object storage on Fly.io (see litestream.yml).
# Release assets call amd64 "x86_64".
# Update both SHA-256s with the version, from the release's checksums.txt.
ARG LITESTREAM_VERSION=0.5.17
ARG LITESTREAM_SHA256_X86_64=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
ARG LITESTREAM_SHA256_ARM64=f8ca4a050095c1efbda2c4365172e61bf9d955ea0d9ac42f448b52e51819baa5
ARG TARGETARCH
RUN set -e; \
    case "$TARGETARCH" in \
        amd64) arch=x86_64; sha="$LITESTREAM_SHA256_X86_64" ;; \
        arm64) arch=arm64; sha="$LITESTREAM_SHA256_ARM64" ;; \
        *) echo "no Litestream checksum for TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
    esac; \
    url="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz"; \
    python -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], '/tmp/litestream.tar.gz')" "$url"; \
    echo "$sha  /tmp/litestream.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream; \
    rm /tmp/litestream.tar.gz; \
    litestream version

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    CHARFLOW_DB=/data/charflow.db

WORKDIR /app

# Install dependencies first so code changes don't invalidate this layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY litestream.yml /etc/litestream.yml
COPY gunicorn.conf.py docker-entrypoint.sh ./
COPY app ./app

RUN useradd --system --create-home --uid 1000 charflow \
    && mkdir -p /data && chown charflow /data
VOLUME /data
EXPOSE 8000

# The entrypoint drops from root to charflow after fixing /data's owner.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn"]
