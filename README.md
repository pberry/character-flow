# Character Flow

A small local-network web app for building a **character-specific combat flowchart** for tabletop RPGs like D&D,
laid out as left-to-right **swim lanes**: one horizontal lane per part of your turn.

1. Answer a short questionnaire about your character (abilities, weapons, spells, features).
2. Those answers become a palette of cards you drag into lanes. New charts start with
   **Start of turn, Attack, Bonus Actions, Reactions, Other Actions**, and you can rename, recolor, reorder, add, or remove lanes.
3. Connect boxes with arrows, within or across lanes. Suggested arrows appear faintly; click one to make it real.
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
| Add a box | Drag a card from the left palette into a lane, or double-click empty space in a lane |
| Fill a lane | Click the lane's header, then click palette cards: each lands at the end of that lane, wrapping to a new row at the page edge |
| Add the next step | Select a box, then click a palette card: the new box is placed to its right |
| Edit text | Double-click a box (or select it and press Enter). Ctrl/Cmd+Enter or click away to finish, Escape to cancel. The first line is shown in bold |
| Color / delete | Select a box, use the toolbar at the top |
| Move | Drag a box (arrows follow). Drop it in another lane to move it there; the target lane is highlighted |
| Resize | Drag the small handle at a box's bottom-right corner |
| Draw an arrow | Hover a box, drag from one of the four side dots to another box |
| Accept a suggested arrow | Select a box, click a faint dashed arrow |
| Select an arrow | Click it |
| Label an arrow | Double-click the arrow, or select it and use "Edit label" |
| Delete | Select a box or arrow and press Delete / Backspace, or use the toolbar |
| Deselect | Escape, or click empty canvas |
| Edit a lane | Click its header: the toolbar renames, recolors, moves it up/down, adds a lane below, or deletes it. Double-click a header to rename |
| Add a lane | "+ Add lane" under the last lane, or "Add lane below" in the lane toolbar |
| Delete a lane | Select it and press Delete or use "Delete lane". Its boxes and their arrows go with it (you're asked first). A chart keeps at least one lane |
| Pan / zoom | Drag empty canvas / mouse wheel or trackpad pinch / the − + buttons. "Fit" frames the whole chart |
| Save | Autosaves; or Save button / Ctrl+S / Cmd+S |
| Print | Print button — prints the chart on one landscape letter page; choose "Save as PDF" in the dialog for a PDF |

## Edit the character

"Edit character" in the editor's top bar reopens the questionnaire. Changes update the palette and the
printed header; boxes already on the canvas are left alone.

## Swim lanes

Lanes grow automatically to fit their boxes and shrink back when boxes move out. A box keeps its color when moved
to another lane; the lane color is only the default for blank boxes added to it (cards from the palette keep their
category color). Use the extra Indigo and Teal swatches for things like "costs a resource" variants within a lane.

## Page size

The chart is always one printed page wide (a dashed line marks the right edge), so box text prints at about 9pt.
Boxes can't be dragged or resized past the edge. When cards are clicked into a full row, they wrap to a new row
in the same lane and the lane grows taller; boxes already placed are never rearranged.

A second dashed line marks the bottom of the printed page. Lanes that run past it still print on one page, but the
whole chart is scaled down to fit, and the line turns red as a warning. About five standard boxes fit in a row.

## Known limitations

- Tested in Google Chrome. Safari and Firefox should work but haven't been checked.
- On touch screens, cards can't be dragged from the palette (tap a card to add it instead), and there's no pinch zoom.
- No undo or version history yet. Use "Duplicate" on the chart list to keep a snapshot before big changes.
- Single user: if two browsers edit the same chart, the last save wins.
- Arrows take simple right-angle routes and don't steer around boxes in their way; nudge boxes or pick other sides.
- Lane headers are part of the canvas, so they scroll out of view if you pan far to the right.

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
| `js/layout.js` | Pure swim-lane layout: lane tops/heights from their boxes, absolute box positions |
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
