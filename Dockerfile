FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.14 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    CHARFLOW_DB=/data/charflow.db

WORKDIR /app

# Install dependencies first so code changes don't invalidate this layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app

RUN useradd --system --create-home --uid 1000 charflow \
    && mkdir -p /data && chown charflow /data
USER charflow
VOLUME /data
EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "--access-logfile", "-", "app:create_app()"]
