# Character Flow

A small local-network web app for building a **character-specific combat flowchart** (left to right) for tabletop RPGs like D&D.

1. Answer a short questionnaire about your character (abilities, weapons, spells, features).
2. Those answers become a palette of cards you drag onto a canvas.
3. Connect boxes with arrows — suggested arrows appear faintly; click one to make it real.
4. Save by name, and print to a single landscape letter page.

## Running with Docker (recommended)

```sh
docker compose up -d --build
```

Then open `http://<this-machine>:5050/` from any device on the network.

- Charts live in the `character-flow_charflow-data` Docker volume (`/data/charflow.db` in the container), so they survive restarts and rebuilds.
- Use a different host port with `CHARFLOW_PORT=8765 docker compose up -d`.
- Back up: `docker compose cp charflow:/data/charflow.db ./charflow-backup.db`
- Update after code changes: `docker compose up -d --build`. Logs: `docker compose logs -f`.

The container runs the app with gunicorn as a non-root user.

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
| Add a box | Drag a card from the left palette onto the canvas, or double-click empty canvas |
| Add the next step | Select a box, then click a palette card: the new box is placed to its right |
| Edit text | Double-click a box (or select it and press Enter). Ctrl/Cmd+Enter or click away to finish, Escape to cancel. The first line is shown in bold |
| Color / delete | Select a box, use the toolbar at the top |
| Move | Drag a box (arrows follow) |
| Resize | Drag the small handle at a box's bottom-right corner |
| Draw an arrow | Hover a box, drag from one of the four side dots to another box |
| Accept a suggested arrow | Select a box, click a faint dashed arrow |
| Select an arrow | Click it |
| Label an arrow | Double-click the arrow, or select it and use "Edit label" |
| Delete | Select a box or arrow and press Delete / Backspace, or use the toolbar |
| Deselect | Escape, or click empty canvas |
| Pan / zoom | Drag empty canvas / mouse wheel or trackpad pinch / the − + buttons. "Fit" frames the whole chart |
| Save | Autosaves; or Save button / Ctrl+S / Cmd+S |
| Print | Print button — fits the chart onto one landscape letter page; choose "Save as PDF" in the dialog for a PDF |

## Edit the character

"Edit character" in the editor's top bar reopens the questionnaire. Changes update the palette and the
printed header; boxes already on the canvas are left alone.

## Known limitations

- Tested in Google Chrome. Safari and Firefox should work but haven't been checked.
- On touch screens, cards can't be dragged from the palette (tap a card to add it instead), and there's no pinch zoom.
- No undo or version history yet. Use "Duplicate" on the chart list to keep a snapshot before big changes.
- Single user: if two browsers edit the same chart, the last save wins.

## Development

```sh
uv run pytest           # API tests + browser end-to-end tests (Playwright, uses installed Google Chrome)
uv run pytest tests/test_api.py   # API tests only
npm test                # frontend logic tests (Node 22+, no dependencies to install)
```

No Chrome? Run `uv run playwright install chromium` and remove `--browser-channel chrome` from `pyproject.toml`.

Project layout:

| Path | Role |
| --- | --- |
| `app/__init__.py` | `create_app()` factory; reads `CHARFLOW_DB` |
| `app/db.py` | SQLite schema and CRUD; each chart is a name plus a JSON document |
| `app/routes.py` | JSON API (`/api/charts`) and the index page |
| `tests/test_api.py` | API tests |
| `tests/e2e/` | Playwright browser tests covering the full flow and print layout |
| `tests/js/` | Node tests for the pure frontend modules |
| `Dockerfile`, `compose.yaml` | Container image (gunicorn, non-root) and service definition |

The frontend is plain ES modules + SVG with no build step, in `app/static/`:

| File | Role |
| --- | --- |
| `js/geometry.js` | Pure math: side-midpoint anchors, elbow routing, suggested arrows, print fitting |
| `js/model.js` | Pure chart operations (boxes, edges, ids, palette, ability modifiers) |
| `js/canvas.js` | SVG rendering and mouse interactions |
| `js/editor.js` | Editor screen: toolbar, palette, autosave, keyboard shortcuts |
| `js/intro.js` | Character questionnaire |
| `js/print.js` | Builds the one-page print layout |
| `js/main.js` | Hash routing between the chart list, questionnaire, and editor |
| `js/palette.js` | Sidebar character summary and palette cards |
| `js/api.js`, `js/dom.js` | Fetch wrappers and tiny element builders |
| `css/app.css`, `css/print.css` | Screen and print styles |
