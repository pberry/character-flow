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
uv run flask --app app run --host 0.0.0.0 --port 5000
```

Then open `http://<this-machine>:5000/` from any device on the network.

Charts are stored in SQLite at `./charflow.db` by default; set `CHARFLOW_DB=/path/to/file.db` to change it.
Back up that file to back up your work.

## Using the editor

| Action | How |
| --- | --- |
| Add a box | Drag a card from the left palette onto the canvas, or double-click empty canvas |
| Edit text | Double-click a box |
| Color / delete | Select a box, use the toolbar at the top |
| Move | Drag a box (arrows follow) |
| Resize | Drag the small handle at a box's bottom-right corner |
| Draw an arrow | Hover a box, drag from one of the four side dots to another box |
| Accept a suggested arrow | Select a box, click a faint dashed arrow |
| Label an arrow | Double-click the arrow |
| Delete | Select a box or arrow and press Delete / Backspace |
| Pan / zoom | Drag empty canvas / mouse wheel (or pinch) |
| Save | Autosaves; or Save button / Ctrl+S / Cmd+S |
| Print | Print button — fits the chart onto one landscape letter page; choose "Save as PDF" in the dialog for a PDF |

## Development

```sh
uv run pytest           # API tests + browser end-to-end tests (Playwright, uses installed Google Chrome)
uv run pytest tests/test_api.py   # API tests only
npm test                # frontend logic tests (Node 22+, no dependencies to install)
```

No Chrome? Run `uv run playwright install chromium` and remove `--browser-channel chrome` from `pyproject.toml`.

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
