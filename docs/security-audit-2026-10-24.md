# Security audit: Character Flow 1.0.1

- **Date:** 2026-10-24
- **Commit audited:** `90d3645` (tag `v1.0.1`)
- **Scope:** Flask API (`app/`), the static front end (`app/static/js`), the Docker image and entrypoint, `fly.toml`,
  Litestream, the backup and admin CLIs, and the GitHub Actions workflows.
- **Method:** I read the code by hand and sent requests through Flask's test client. I ran `pip-audit` against the
  locked dependencies and searched the git history for secrets.

## Summary

The design is sound for what the app is: no accounts, and access only through 128-bit secret keys. Keys stay in
the URL fragment, so the browser never sends them in a page request. Edit keys are stored only as SHA-256 hashes,
and the access log leaves out request paths. The CSP allows scripts only from the site itself, and the front end
builds its DOM from text nodes, so I found no XSS. Every SQL query is parameterized.

I found no critical or high-severity issues. The biggest risk is **availability**: anyone, without signing in, can
use up the chart limit or the disk, because no rate limit exists and the database has no size limit. The other
findings are hardening.

| # | Finding | Severity |
|---|---------|----------|
| 1 | Anonymous clients can fill the server (chart limit and disk) | Medium |
| 2 | The Litestream binary is downloaded without a checksum check | Medium |
| 3 | Deeply nested JSON returns a 500 instead of a 400 | Low |
| 4 | The `www.` redirect trusts the `Host` header (open redirect) | Low |
| 5 | No `Strict-Transport-Security` header | Low |
| 6 | Responses that contain an edit key have no `Cache-Control: no-store` | Low |
| 7 | GitHub Actions and base images are pinned by tag, not by digest | Low |
| 8 | CSP has no `base-uri` or `form-action` | Informational |

## Findings

### 1. Anonymous clients can fill the server (Medium)

**Where:** `app/__init__.py:16-17`, `app/routes.py:79-84`, `fly.toml`

`POST /api/charts` and `POST /api/view/<key>/copy` need no credentials and have no rate limit. Two limits apply:

- `MAX_CHARTS` (default 5000). Once a script reaches it, every visitor gets
  `503 this server is full` until the operator deletes charts by hand. I confirmed this with `max_charts=3`.
- `MAX_CONTENT_LENGTH` of 1 MiB per request. 5000 charts × 1 MiB is about 5 GB, but the README creates a 1 GB Fly
  volume (`fly volumes create charflow_data --size 1`). A full disk would break writes for every chart before the
  limit is even reached.

`PUT /api/edit/<key>` with a 1 MiB body in a loop also grows the WAL and the Litestream replica, which costs storage
on the Tigris bucket.

**Recommendation:**

- Limit total stored bytes, not just the number of charts: refuse a create or update when
  `sum(length(data))` would exceed a limit sized to the volume.
- Lower the per-chart size to what a real chart needs. Measure the largest real chart first; it is probably well
  under 100 KB.
- Add a per-IP rate limit on creates and copies (for example, a few per minute). Use Fly's `Fly-Client-IP`, or
  `ProxyFix(x_for=1)`. An in-process counter is enough with one machine.

### 2. The Litestream binary is downloaded without a checksum check (Medium)

**Where:** `Dockerfile:5-15`

The image downloads `litestream-<version>-linux-<arch>.tar.gz` from GitHub Releases and puts it in
`/usr/local/bin` without checking a hash. If that release asset were replaced, the replaced binary would run with
the replica credentials and the whole database.

**Recommendation:** pin the SHA-256 for each architecture as build args and run `sha256sum -c` before extracting.

### 3. Deeply nested JSON returns a 500 (Low)

**Where:** `app/routes.py` (`request.get_json(silent=True)` in every write route)

A body like `{"name":"a","data":{"x":[[[[…]]]]}}` with about 100,000 levels raises `RecursionError` inside
`json.loads`. `silent=True` doesn't catch it, so the request returns an HTML 500 and logs a long traceback. The
worker survives, so this is noise, not a crash. About 900 levels are accepted and stored.

**Recommendation:** register an error handler for `RecursionError` that returns `error("invalid JSON", 400)`, or
catch it around `get_json`.

### 4. The `www.` redirect trusts the `Host` header (Low)

**Where:** `app/routes.py:37-40`

`drop_www` builds the redirect from `request.url`, which comes from the `Host` header. A request with
`Host: www.evil.example` gets `301 Location: http://evil.example/`. I confirmed this with the test client. To
exploit it, an attacker has to control the `Host` header the server receives, for example through a cache in front
of the app or an IP that sends any hostname to it. Whether Fly's routing allows that here was not tested.

**Recommendation:** redirect only to a known host. For example, when `CHARFLOW_BASE_URL` is set, redirect
`www.<that host>` to it and ignore other hosts. Flask's `TRUSTED_HOSTS` setting (Flask 3.1+) can also reject
unknown hosts.

### 5. No `Strict-Transport-Security` header (Low)

**Where:** `app/routes.py:15-20`

Fly's `force_https` redirects plain HTTP, but without HSTS the browser's first request can still go over HTTP. Keys
are in the URL fragment and aren't sent to the server, but a man-in-the-middle on that first request could serve
modified JavaScript that reads the fragment and `localStorage` (which holds every recent edit key).

**Recommendation:** send `Strict-Transport-Security: max-age=31536000` (consider `includeSubDomains` and preload
later), only when the request arrived over HTTPS, so local Docker on plain HTTP isn't affected.

### 6. Edit-key responses have no `Cache-Control: no-store` (Low)

**Where:** `app/routes.py` (`editable()` responses)

`GET`/`PUT /api/edit/<key>` and both create routes return the edit key in the body with no cache headers. Browsers
usually don't cache these heuristically, but `no-store` keeps them out of disk caches and any shared proxy for
certain.

**Recommendation:** set `Cache-Control: no-store` on `/api/*` responses.

### 7. Actions and images are pinned by tag (Low)

**Where:** `.github/workflows/*.yml`, `Dockerfile:1-3`

`actions/checkout@v4`, `astral-sh/setup-uv@v6`, `actions/setup-node@v4`, `actions/upload-artifact@v4`,
`superfly/flyctl-actions/setup-flyctl@1.6`, `python:3.14-slim`, and `ghcr.io/astral-sh/uv:0.11.14` can all change
under the same tag. The deploy job holds `FLY_API_TOKEN`, so a changed action there could take over the app.

The workflows otherwise follow good practice: `permissions: contents: read`, a `production` environment for the
token, and `workflow_dispatch` inputs passed through `env`, not inlined into shell.

**Recommendation:** pin the deploy job's third-party actions (`superfly/flyctl-actions` at least) to commit SHAs,
and let Dependabot keep them current.

### 8. CSP has no `base-uri` or `form-action` (Informational)

**Where:** `app/routes.py:19`

`default-src` doesn't cover `base-uri` or `form-action`. Without an injection point, this has no effect today.
Adding `base-uri 'none'; form-action 'self'; object-src 'none'` costs nothing.

## Checked and fine

- **SQL injection:** every query uses `?` parameters. `db._get` puts `where` into the SQL with an f-string, but every
  caller passes a constant column name.
- **XSS:** `dom.js` adds children as text nodes. Chart data reaches only SVG `fill` attributes and inline
  `background` styles. `script-src 'self'` and `img-src 'self' data:` stop script injection and CSS-based data
  exfiltration. The only `href` built from data is `#/edit/<key>` from `localStorage`, which always starts with `#`.
- **CSRF and CORS:** no CORS headers are sent. Write routes only read `application/json` bodies, which a cross-site
  form can't send, and every chart route needs a secret key.
- **Key handling:** 128-bit keys from `secrets.token_urlsafe(16)`. Edit keys are hashed at rest, and unknown keys
  return a plain 404. The gunicorn access log format leaves out the path, and `Referrer-Policy: no-referrer` keeps
  keys out of `Referer`. The view endpoint never returns an edit key.
- **Clickjacking:** `frame-ancestors 'none'`.
- **Container:** gunicorn runs as uid 1000 through `setpriv`. Root is used only to `chown /data`. The backup service
  mounts the live volume read-only.
- **Dependencies:** `pip-audit` found no known vulnerabilities in the locked set (Flask 3.1.3, Werkzeug 3.1.9,
  Jinja2 3.1.6, gunicorn 26.2.0). The front end has no npm dependencies.
- **Secrets in git:** a search of the full history found no committed credentials, `.env` files, keys, databases,
  or the reference PDF.
- **Admin and backup CLIs:** these run only on the host, with no network surface.

## Accepted risks (by design)

- Anyone holding a link has its access, and links can't be revoked except by an operator `reset-link`. View keys
  have no revoke at all.
- Every recent edit key is kept in `localStorage`, so XSS or a malicious browser extension on the site would expose
  all of them. The strict CSP is what protects this.
- View keys are stored in plaintext so the editor can show the view link.
