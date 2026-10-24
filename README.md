# Character Flow

A small web app for building a **character-specific combat flowchart** for tabletop RPGs like D&D,
laid out as left-to-right **swim lanes**: one horizontal lane per part of your turn. It runs at
[characterflow.app](https://characterflow.app), and you can also run it yourself with Docker.

1. Answer a short questionnaire about your character (abilities, weapons, spells, features).
2. Those answers become a palette of cards you drag into lanes. New charts start with
   **Start of turn, Attack, Bonus Actions, Reactions, Other Actions**, and you can rename, recolor, reorder, add, or remove lanes.
3. Connect boxes with arrows, within or across lanes. Suggested arrows appear faintly; click one to make it real.
4. Charts save automatically, and you print them on a single letter page, landscape or portrait.

## Links instead of accounts

There are no accounts. Each chart has two secret links, shown when you create it and from the editor's **Links**
button:

- The **edit link** (`/#/edit/<key>`) opens the editor. Anyone with it can change or delete the chart, so keep it
  private.
- The **view link** (`/#/view/<key>`) shows the chart read-only, with Print and **Make a copy**. Share this one.

Keys are 128 random bits. The server stores only a hash of each edit key, so a copy of the database can't be used
to edit charts. The home page lists the charts this browser has opened (kept in the browser's local storage, with
Rename, Duplicate, and Delete). If an edit link is lost, the operator can issue a new one; see the admin commands
below.

## Running with Docker (recommended)

```sh
docker compose up -d --build
```

Then open `http://<this-machine>:5050/` from any device on the network.

- Charts live in the `character-flow_charflow-data` Docker volume (`/data/charflow.db` in the container), so they survive restarts and rebuilds.
- Use a different host port with `CHARFLOW_PORT=8765 docker compose up -d`.
- Update after code changes: `docker compose up -d --build`. Logs: `docker compose logs -f`.

The container runs the app with gunicorn as a non-root user.

### Backups

The `backup` service snapshots the database every hour into `./backups/` on the host (set `CHARFLOW_BACKUPS` to
use another folder). The snapshots live outside the Docker volume, so they survive even `docker compose down -v`.

- A snapshot is only written when the data changed since the last one, and each is integrity-checked.
- The newest 48 are kept, plus the last snapshot of each day for 90 days.
- The live database is mounted read-only in the backup container.
- Snapshot now (e.g. before an upgrade): `docker compose exec backup python -m app.backup --db /data/charflow.db --dest /backups`
- Check it's running: `docker compose logs backup`.
- On a Linux host, create the folder first (`mkdir backups`) and make sure uid 1000 can write to it.

The image runs gunicorn through `docker-entrypoint.sh`. It starts as root only to take ownership of `/data`, then
runs as the `charflow` user. Litestream (below) is only used when `LITESTREAM_REPLICA_URL` is set, so local Docker
runs exactly as before.

Restore a snapshot. This replaces every chart with the snapshot's contents. The current data is snapshotted first,
so a restore can be undone the same way.

```sh
docker compose stop charflow
docker compose run --rm --no-deps -v ./backups:/backups charflow \
  python -m app.backup --db /data/charflow.db --dest /backups --restore /backups/charflow-YYYYMMDD-HHMMSS.db
docker compose start charflow
```

To look inside a snapshot first, open it with any SQLite tool: `sqlite3 backups/<file> "select name, updated_at from charts"`.

## Hosting on Fly.io

The public site runs on [Fly.io](https://fly.io) as one small machine (`fly.toml`) that stops when idle and starts
on the next request, which takes a second or two. SQLite lives on a Fly volume at `/data`, so the app must run
**exactly one machine**. Expect roughly $1–3 a month.

### One-time setup

```sh
fly launch --no-deploy --copy-config          # uses fly.toml; change `app` if the name is taken
fly volumes create charflow_data --size 1     # in fly.toml's primary_region
fly storage create -n characterflow-backups   # Tigris bucket for Litestream; sets the AWS_* key secrets
fly certs add characterflow.app && fly certs add www.characterflow.app   # then add the DNS records it prints
fly tokens create deploy                      # store as FLY_API_TOKEN in the GitHub "production" environment
```

Create the Tigris bucket before the first deploy: `fly.toml` turns Litestream on, and it can't start without
the bucket's keys. If the bucket name is taken, use another and update `LITESTREAM_REPLICA_URL` in `fly.toml`.
Requests to `www.` redirect to the bare domain.

### Releasing

Push a tag (`git tag v1.0.0 && git push origin v1.0.0`) and the **Deploy** workflow
(`.github/workflows/deploy.yml`):

1. runs the full CI suite on the tag;
2. checks that the tag matches `pyproject.toml`'s version and has a `CHANGELOG.md` section;
3. snapshots the Fly volume;
4. runs `flyctl deploy --remote-only` (Fly builds the image);
5. checks `https://characterflow.app/healthz` and the home page.

To roll back, run the Deploy workflow by hand ("Run workflow") with an older tag. If a release damaged data, restore
the volume snapshot taken just before it (`fly volumes snapshots list charflow_data`).

CI (`.github/workflows/ci.yml`) runs both test suites and a Docker build on every pull request and push to `main`.

Actions are pinned to commit SHAs (the version is in a comment) and the `Dockerfile` base images to digests, so a
moved tag can't change what runs with the Fly token. Dependabot (`.github/dependabot.yml`) opens a monthly pull
request for each group of updates; review and merge those rather than editing the pins by hand.

### Backups on Fly

- **Litestream** streams every change to the Tigris bucket while the app runs. When the machine starts with an
  empty volume, it restores the database from the bucket first. The bucket keeps about a day of history
  (Litestream's default retention), so it's for restoring the latest data.
- **Fly volume snapshots** cover going further back. They're taken daily and kept for 30 days (`snapshot_retention` in `fly.toml`), plus one before
  every deploy.
- The hourly `backup` service in `compose.yaml` is for local Docker only.

### Admin commands

There's no admin page. Run these where the database lives:

```sh
fly ssh console -C "python -m app.admin list"                # id, last update, and name of every chart
fly ssh console -C "python -m app.admin reset-link 4"        # prints a new edit link; the old one stops working
```

Locally: `docker compose exec charflow python -m app.admin list` (or `uv run python -m app.admin --db charflow.db list`).
Links print with `CHARFLOW_BASE_URL` (default `https://characterflow.app`); pass `--base-url` to change it.

### Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHARFLOW_DB` | `charflow.db` (`/data/charflow.db` in the image) | SQLite file |
| `CHARFLOW_WAL` | off | `1` turns on SQLite WAL mode (needed by Litestream; set in `fly.toml`) |
| `CHARFLOW_MAX_CHARTS` | 5000 | New charts are refused (503) past this many, to bound disk use |
| `CHARFLOW_CREATE_LIMIT` | 20 | New charts (creates and copies) one client can make per hour; past it they get a 429. `0` turns it off |
| `CHARFLOW_CLIENT_IP_HEADER` | unset (`Fly-Client-IP` in `fly.toml`) | Header holding the client's address for that limit. Set it only behind a proxy that sets it; otherwise the connection's address is used |
| `CHARFLOW_BASE_URL` | `https://characterflow.app` | The public address: base for links printed by `app.admin`, and `www.` of its host redirects here |
| `GUNICORN_WORKERS` | 2 | Gunicorn worker processes (1 on Fly's 256MB machine) |
| `LITESTREAM_REPLICA_URL` | unset (Tigris bucket in `fly.toml`) | Turns on Litestream replication and restore. Keys come from `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |

The create limit is counted in memory, so it resets when the app restarts, and with several Gunicorn workers each
keeps its own count. Requests over 1MB are refused (413), and so is JSON nested more than 64 levels deep (400). Access logs leave out request paths, because paths contain chart keys. API
responses are never cached (`Cache-Control: no-store`), and responses over HTTPS send `Strict-Transport-Security`.

## Running locally without Docker

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```sh
uv sync
uv run flask --app app run --host 0.0.0.0 --port 8000
```

Then open `http://<this-machine>:8000/` from any device on the network. Any free port works; this doesn't use 5050, so it can run alongside the Docker container.

Charts are stored in SQLite at `./charflow.db` by default; set `CHARFLOW_DB=/path/to/file.db` to change it.
Back up that file to back up your work.

## Using the editor

| Action | How |
| --- | --- |
| Add a box | Drag a card from the left palette into a lane, or double-click empty space in a lane |
| Fill a lane | Click the lane's header, then click palette cards: each lands at the end of that lane, wrapping to a new row at the page edge |
| Add the next step | Select a box, then click a palette card: the new box is placed to its right |
| Edit text | Double-click a box (or select it and press Enter). Ctrl/Cmd+Enter or click away to finish, Escape to cancel. The first line is shown in bold |
| Color / shape / delete | Select a box, use the toolbar at the top |
| Nudge | Select one or more boxes and press the arrow keys to move them 10px (Shift+arrow: 50px). Boxes stay in their lane; drag to change lanes |
| Add the side column | With nothing selected, click "Add side column" in the toolbar |
| Add a tracker item | Click a side-column section heading, then "Add item" (or select an item and "Add item below"); type its text |
| Edit a tracker item | Double-click it (or select it and press Enter). The toolbar sets its color, tick circles, badges, and order, and deletes it |
| Select several boxes | Shift-click boxes (Shift-click a selected box to drop it) |
| Group boxes | Select one or more boxes, click "Group" in the toolbar |
| Edit a group | Click its line. Edit the label and style in the toolbar, or double-click the line to edit the label. Shift-click boxes to add or remove them. "Ungroup" removes the line; the boxes stay |
| Add a badge | Select a box, tracker item, or lane header, then click "+ Cost", "+ Duration", "+ Recharge", or "+ Modifier" in the toolbar |
| Select a badge | Click it, or click its chip in the box's toolbar. The toolbar then edits its text, picks its color (or "Default" for its type's color), and removes it. Escape goes back to its box |
| Edit / remove a badge | Double-click the badge to edit its text. × on its chip removes it, as do clearing its text and Delete while it's selected |
| Move | Drag a box (arrows follow). Drop it in another lane to move it there; the target lane is highlighted |
| Resize | Drag the small handle at a box's bottom-right corner |
| Draw an arrow | Hover a box, drag from one of the four side dots to another box |
| Accept a suggested arrow | Select a box, click a faint dashed arrow |
| Select an arrow | Click it |
| Label an arrow | Double-click the arrow, or select it and use "Edit label" |
| Delete | Select a box or arrow and press Delete / Backspace, or use the toolbar |
| Deselect | Escape, or click empty canvas |
| Edit a lane | Click its header: the toolbar renames, recolors, adds badges, moves it up/down, adds a lane below, or deletes it. Double-click a header to rename |
| Add a lane | "+ Add lane" under the last lane, or "Add lane below" in the lane toolbar |
| Delete a lane | Select it and press Delete or use "Delete lane". Its boxes and their arrows go with it (you're asked first). A chart keeps at least one lane |
| Pan / zoom | Drag empty canvas / mouse wheel or trackpad pinch / the − + buttons. "Fit" frames the whole chart |
| Save | Autosaves; or Save button / Ctrl+S / Cmd+S |
| Print | Print button — prints the chart on one letter page; choose "Save as PDF" in the dialog for a PDF |
| Print orientation | Landscape / Portrait buttons next to Print. Saved with the chart; new charts start landscape |

## Edit the character

"Edit character" in the editor's top bar reopens the questionnaire. Changes update the palette, the
printed header, and the printed notes; boxes already on the canvas are left alone.

## Swim lanes

Lanes grow automatically to fit their boxes and shrink back when boxes move out. A box keeps its color when moved
to another lane; the lane color is only the default for blank boxes added to it (cards from the palette keep their
category color). Use the extra Indigo and Teal swatches for things like "costs a resource" variants within a lane.

## Box shapes

Select a box and pick a shape in the toolbar: rectangle, flag, diamond, star, document (wavy bottom), right
arrow, or up arrow. Shapes only tell boxes apart; the app doesn't give them a meaning. For example, the Meren
mock-up uses diamonds for branches, a star for a buff you activate, and arrows for jumps. The "Decision?" card
starts as a diamond. Switching to a diamond, star, or arrow grows the box if it's too small for that shape (it
never shrinks a box). Arrows still attach at the four side midpoints, where they meet the shape's outline.
Lane headers are drawn as flags.

## Badges

Badges are small labels on a box's corners, as in the Meren mock-up. Each type has its own shape and corner, so they
stay distinct when printed in black and white:

| Type | Shape | Corner | Examples |
| --- | --- | --- | --- |
| Cost | Circle with a red ring | Top right | `1 FP` |
| Duration | Pill | Top left | `10 min`, `1 hr` |
| Recharge | Plus | Bottom right | `SR` (short rest), `LR` (long rest) |
| Modifier | Triangle | Bottom left | `2x`, `2x + 9' reach` |

The text is free; the type picks the shape and corner. Each badge starts in its type's color, and a selected badge can
be given any swatch color instead (the shape still tells types apart in black and white). A box can have several badges, and more of the same type line up
outward from their corner. On shaped boxes a badge sits on the outline nearest its corner (a star's arm tips, for
example). Longer text wraps onto short lines. Lanes grow to fit badges that hang below a box.

Lane headers (the flag at the start of each lane) can have badges too. They line up inward from their corners, and
the flag shrinks to make room, so they stay inside the lane and the header column.

## Groups

A group draws a line around related boxes, such as effects that apply while a buff is active. A **bracket** is open on
the left, as in the Meren mock-up; an **outline** is a closed rounded rectangle. A group can have a label, shown
centered on its top edge. The line is worked out from the boxes each time, so it follows them when they move, even
across lanes. Deleting a box takes it out of its groups, and a group with no boxes left disappears.

## Side column

A chart can have a tracker column left of the lanes for things that aren't part of the turn: gear, resource pools
like Focus or Luck Points, potions, and conditions. It starts with Gear, Resources, Healing, and Conditions sections,
which you can rename, reorder, add, and delete; select a section heading to edit it, or the column's background to
add a section or remove the column.

Items stack automatically within their section. Each has text (the first line is bold), optional **tick circles**
to mark in pencil at the table (up to 20, e.g. three for 3 Focus Points), a color (white unless you pick one), and
badges like boxes have (e.g. `SR` and `LR` on Focus Points). On items, several badges of one type line up inward so they stay inside the column.

The column takes its 200 units of width from the lanes, so the print scale doesn't change: about four standard boxes
fit in a row instead of five. Boxes past the new right edge are pulled back in when the column is added. Removing the
column gives the width back (boxes stay where they are).

## Page size

The chart is always one printed page wide (a dashed line marks the right edge), so box text prints at about 9pt.
Boxes can't be dragged or resized past the edge. When cards are clicked into a full row, they wrap to a new row
in the same lane and the lane grows taller; boxes already placed are never rearranged.

A second dashed line marks the bottom of the printed page. Lanes that run past it still print on one page, but the
whole chart is scaled down to fit, and the line turns red as a warning. About five standard boxes fit in a row.

The character's **Notes** from the questionnaire print in a strip under the chart. When there are notes, the chart
area is 0.8in shorter, so the bottom-of-page line moves up to match ("notes print below"). Notes longer than four
printed lines are cut off.

**Portrait** suits charts with many lanes. The canvas stays the same width, so nothing moves, but the chart prints at
about three quarters of the landscape size (box text around 7pt) on a page about 1.8 times as tall. Switching
orientation moves the bottom-of-page line to match.

## Static pages

Pages like the FAQ are plain HTML in `app/templates/pages/`. A file named `<name>.html` is served at `/<name>`
(lowercase letters, digits, and hyphens only). Each page extends `app/templates/base.html`, which supplies the
stylesheet, header, and footer, and fills three blocks:

```html
{% extends "base.html" %}
{% block title %}About{% endblock %}
{% block description %}One sentence for search results.{% endblock %}
{% block content %}
<h1>About</h1>
<section class="panel"><p>Anything you like.</p></section>
{% endblock %}
```

No route is needed: add the file, link to it, and redeploy. Scripts on these pages must be
files under `/static/`, because the Content-Security-Policy blocks inline scripts.

## Known limitations

- Tested in Google Chrome. Safari and Firefox should work but haven't been checked.
- On touch screens, cards can't be dragged from the palette (tap a card to add it instead), and there's no pinch zoom.
- No undo or version history yet. Use "Duplicate" on the home page to keep a snapshot before big changes.
- Lose your edit link and only the operator can reissue it (`app.admin reset-link`); there's no self-service recovery.
- The home page only lists charts opened in that browser. Clearing site data forgets them (the links still work).
- If two people edit the same chart at once, the last save wins.
- The limit on new charts is per IP address, so players sharing one network (a game store's Wi-Fi) share it too.
  Raise `CHARFLOW_CREATE_LIMIT` if a busy table hits it.
- Arrows take simple right-angle routes and don't steer around boxes in their way; nudge boxes or pick other sides.
- Lane headers are part of the canvas, so they scroll out of view if you pan far to the right.
- Side-column item heights are estimated from the text, so unusual text (many wide capitals) can be clipped; add a
  line break or shorten it.
- Side-column items can be reordered within their section but not dragged to another section.
- Portrait prints smaller than landscape, because the canvas keeps its landscape width.
- Printed notes stop after four lines (about 600 characters); keep the table-critical ones first.

## Development

Product goals, decisions, and the roadmap are in [PRD.md](PRD.md). PRD, README, and CHANGELOG are living
documents and are updated in the same change as the code (see [CLAUDE.md](CLAUDE.md)).

```sh
uv run pytest           # API tests + browser end-to-end tests (Playwright, uses installed Google Chrome)
uv run pytest tests/test_api.py   # API tests only
npm test                # frontend logic tests (Node 22+, no dependencies to install)
```

No Chrome? Run `uv run playwright install chromium` and remove `--browser-channel chrome` from `pyproject.toml`.

Project layout:

| Path | Role |
| --- | --- |
| `app/__init__.py` | `create_app()` factory; reads the settings above |
| `app/db.py` | SQLite schema, keys, and migration; each chart is a name plus a JSON document |
| `app/routes.py` | JSON API (`/api/charts`, `/api/edit/<key>`, `/api/view/<key>`), security headers, static pages, `/healthz` |
| `app/templates/` | `base.html` layout and static pages (`pages/<name>.html`, served at `/<name>`) |
| `app/admin.py` | Operator commands (`python -m app.admin list`, `reset-link`) |
| `app/backup.py` | Database snapshots and rotation (`python -m app.backup`), run by the `backup` service |
| `tests/test_api.py`, `tests/test_db.py`, `tests/test_admin.py` | API, storage and migration, and admin tests |
| `tests/test_backup.py` | Backup and rotation tests |
| `tests/e2e/` | Playwright browser tests covering the full flow and print layout |
| `tests/js/` | Node tests for the pure frontend modules |
| `Dockerfile`, `compose.yaml` | Container image (gunicorn, Litestream, non-root), the app service, and the backup service |
| `docker-entrypoint.sh`, `gunicorn.conf.py`, `litestream.yml` | Container startup, gunicorn settings, Litestream replica |
| `fly.toml` | Fly.io app, volume, health check, and machine size |
| `.github/workflows/` | CI (`ci.yml`) and tag-triggered deploys (`deploy.yml`) |

The frontend is plain ES modules + SVG with no build step, in `app/static/`:

| File | Role |
| --- | --- |
| `js/layout.js` | Pure swim-lane layout: lane tops/heights from their boxes, absolute box positions |
| `js/geometry.js` | Pure math: side-midpoint anchors, elbow routing, suggested arrows, print fitting |
| `js/shapes.js` | Pure box-shape outlines, text areas, and where arrows meet each outline |
| `js/badges.js` | Pure badge types, sizes, text wrapping, and corner placement |
| `js/groups.js` | Pure groups: membership, bracket and outline paths around boxes |
| `js/sidebar.js` | Pure tracker side column: sections, items, tick circles, and stacking layout |
| `js/model.js` | Pure chart operations (boxes, edges, ids, palette, ability modifiers) |
| `js/colors.js` | The color swatches and color validation |
| `js/canvas.js` | SVG rendering and mouse interactions |
| `js/editor.js` | Editor screen: toolbar, palette, autosave, keyboard shortcuts |
| `js/intro.js` | Character questionnaire |
| `js/print.js` | Builds the one-page print layout |
| `js/main.js` | Home page and hash routing between home, questionnaire, editor, and view page |
| `js/recent.js` | Pure list of this browser's charts, kept in localStorage |
| `js/links.js` | The edit and view links dialog |
| `js/view.js` | Read-only view page (reuses the print layout) |
| `js/palette.js` | Sidebar character summary and palette cards |
| `js/api.js`, `js/dom.js` | Fetch wrappers and tiny element builders |
| `css/app.css`, `css/print.css` | Screen and print styles |
