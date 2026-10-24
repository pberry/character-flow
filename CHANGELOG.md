# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security
- The Docker build checks the Litestream download against its pinned SHA-256 before installing it, and fails
  on a mismatch ([#24](https://github.com/pberry/character-flow/issues/24)).
- A monthly workflow opens an issue when a new Litestream release is out, since Dependabot doesn't track it
  and the version and checksums are updated by hand.

## [1.2.0] - 2026-10-24

### Added
- The home page shows a short looping video of a chart being built for Sable Quickfingers, a level 5 rogue. It
  stays paused for players who prefer reduced motion. `scripts/record_demo.py` re-records it after UI changes.
- An example chart for Sable, linked from the home page's "Start a chart" panel (`#/example/sable`), so new
  players can see a finished chart and make their own editable copy instead of starting from a blank page.

### Security
- Each client can make 20 new charts (creates and copies) an hour, so one script can't fill the server
  ([#19](https://github.com/pberry/character-flow/issues/19)). Past that it gets a 429 saying when to try again.
  Set `CHARFLOW_CREATE_LIMIT` to change it.
- GitHub Actions are pinned to commit SHAs and the Docker base images to digests, with Dependabot proposing
  updates monthly ([#25](https://github.com/pberry/character-flow/issues/25)).

## [1.1.0] - 2026-10-24

### Added
- An FAQ page at `/faq`, linked from the home page footer.
- Static pages: drop an HTML file in `app/templates/pages/` and it's served at `/<name>` with the site's styles,
  header, and footer.

## [1.0.2] - 2026-10-24

### Fixed
- A request body that isn't a JSON object, or nests more than 64 levels deep, is now refused with a 400 instead of
  failing with a 500 or being stored.

### Security
- The `www.` redirect only applies to the host in `CHARFLOW_BASE_URL`, so a forged `Host` header can't send
  visitors to another site.
- Responses over HTTPS send `Strict-Transport-Security`.
- API responses send `Cache-Control: no-store`, so edit keys aren't kept in browser or proxy caches.
- The Content-Security-Policy adds `object-src 'none'`, `base-uri 'none'`, and `form-action 'self'`.

## [1.0.1] - 2026-10-24

### Fixed
- `www.characterflow.app` now redirects straight to `https://characterflow.app`, not to `http://` first.

## [1.0.0] - 2026-10-24

### Added
- Charts now have a private **edit link** and a shareable, read-only **view link**, shown when a chart is created
  and from the new **Links** button in the editor. The view link opens the chart as it prints, with Print and
  **Make a copy**.
- A home page that explains what Character Flow is, who it's for, and how links work, with page metadata and an
  icon.
- Hosting on Fly.io at characterflow.app: a `fly.toml`, Litestream backups to a Tigris bucket, and GitHub Actions
  for CI on every pull request and deploys from release tags.
- `python -m app.admin` lists charts and reissues lost edit links.
- `/healthz` for health checks.
- Arrow keys nudge the selected box or boxes one grid step; Shift+arrow moves five. Boxes stay in their lane
  ([#17](https://github.com/pberry/character-flow/issues/17)).

### Changed
- **Breaking:** old `#/chart/<id>` links no longer work. Existing charts get new keys when the database is upgraded,
  and the operator hands out new links with `python -m app.admin reset-link`.
- The home page lists only the charts opened in this browser, not every chart on the server.
- Chart names no longer have to be unique.
- Gunicorn access logs no longer include request paths, which now contain chart keys.

### Security
- Charts can only be read or changed with their keys, and only a hash of each edit key is stored.
- Requests over 1MB are refused, and the total number of charts is capped (`CHARFLOW_MAX_CHARTS`).
- Responses send `Content-Security-Policy`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options` headers.

## [0.10.0] - 2026-10-21

### Added
- Charts can print in portrait as well as landscape
  ([#15](https://github.com/pberry/character-flow/issues/15)). Use the Landscape / Portrait buttons next to Print.
  Portrait fits a much taller chart on the page, printed a little smaller. The bottom-of-page line follows the
  choice, which is saved with the chart.

### Changed
- Charts now store `orientation`. Older charts load as landscape.

## [0.9.0] - 2026-10-21

### Added
- Automatic backups: a `backup` service in `compose.yaml` snapshots the database every hour into `./backups/` on
  the host. Unchanged data is skipped, and old snapshots are thinned out (the newest 48, plus one a day for 90 days).
  The README explains how to restore one.
- Tracker items in the side column can have a color, picked from the same swatches as boxes. Items stay white
  unless you pick one.
- Badges can be selected: click one on the chart or its chip in the toolbar. A selected badge can have its text
  edited, get its own color (or "Default" for its type's color), or be removed with Delete. Escape goes back to its box.
- Lane headers can have badges. Select a lane's flag and use the badge buttons. The flag shrinks to keep its badges
  inside the lane.
- The character's notes print in a strip under the chart. With notes, the chart area is a little shorter, and the
  editor's bottom-of-page line moves up to match.

### Changed
- Charts now store `badges` on lanes. Older charts load with none.
- Clicking a badge chip in the toolbar now selects the badge instead of opening a text prompt (double-clicking a badge
  still edits its text).

## [0.8.0] - 2026-10-16

### Added
- Groups: a bracket (open on the left) or outline around related boxes, with an optional label. Shift-click boxes to
  select several, then "Group". The line follows its boxes when they move, and prints.
- Shift-click to select several boxes; "Delete boxes" deletes them all.

### Changed
- Charts now store `groups`. Older charts load with none.

### Fixed
- The toolbar no longer shows a stray "null" when nothing is selected in a chart with a side column (since 0.7.0).
- The chart no longer jumps up or down when selecting something changes the toolbar's height.

## [0.7.0] - 2026-10-16

### Added
- Tracker side column for gear, resources, healing, and conditions, added from the toolbar. Sections can be renamed,
  reordered, added, and deleted. Items stack automatically and have text, tick circles to mark in pencil, and badges.
  The column prints with the chart.

### Changed
- Adding the side column narrows the lanes by 200 units (four standard boxes per row instead of five) so the print
  scale stays the same; boxes past the new edge are pulled back in.
- Charts now store `sidebar` (null when there's no column). Older charts load without one.

### Fixed
- Two clicks in the same spot with an edit in between no longer count as a double-click.

## [0.6.0] - 2026-10-16

### Added
- Badges on boxes: cost (circle), duration (pill), recharge (plus), and modifier (triangle), each on its own corner.
  Add them from the box toolbar; double-click a badge or use its toolbar chip to edit or remove it. Badges print.
- Long badge text wraps onto short lines, and lanes grow to fit badges hanging below a box.

### Changed
- The box toolbar wraps onto a second row when it doesn't fit.
- Boxes now store `badges`. Older charts load with none.

## [0.5.0] - 2026-10-16

### Added
- Box shapes: rectangle, flag, diamond, star, document (wavy bottom), right arrow, and up arrow, picked from the
  box toolbar. Arrows attach where each side's midpoint meets the shape's outline, and shapes print.
- Switching to a diamond, star, or arrow grows a too-small box to fit the shape.
- `PRD.md`: goals, requirements, decisions log, and roadmap. It's a living document.
- `CLAUDE.md`: repo instructions to keep PRD, README, and CHANGELOG updated alongside code changes.
- `.gitignore` entry for the local Meren reference mock-up PDF.

### Changed
- Lane headers are drawn as flags, marking the start of each swim lane.
- The "Decision?" palette card starts as a diamond.
- Boxes now store a `shape`. Older charts load with rectangles.

## [0.4.0] - 2026-10-14

### Added
- Fixed page width: the canvas shows the printed page's right edge, and boxes can't be dragged or resized past it.
- Cards clicked into a lane wrap to a new row in that lane when the row is full (about five boxes per row).
- A "Bottom of the printed page" guide that turns red when the lanes run past it, meaning the chart will print smaller.

### Changed
- Print always uses the full page width, so every chart that fits the page prints at the same, readable scale.
- Cards added next to the selected box use the same 40-unit spacing as cards added to the end of a lane.
- Charts loaded with boxes beyond the page edge have them pulled back onto the page.

## [0.3.0] - 2026-10-14

### Added
- Swim lanes. New charts start with Start of turn, Attack, Bonus Actions, Reactions, and Other Actions.
  Lanes grow automatically to fit their boxes.
- Lane editing: click a lane header to rename, recolor, move up/down, add a lane below, or delete it
  (with its boxes); "+ Add lane" under the last lane; double-click a header to rename.
- Drag boxes between lanes, with the target lane highlighted while dragging.
- With a lane selected, clicking palette cards adds them to the end of that lane.
- "Blank box" palette card that takes the color of the lane it lands in.
- Teal and Indigo box colors.

### Changed
- Chart data format v2: charts have `lanes`, and each box has a `lane` with `y` measured from the
  lane's top. Older charts aren't migrated (the database was reset for this release).
- Palette "Flow" group is now "Decision?" and "Blank box" (lanes replace Start/End cards).
- Arrow labels draw above boxes so short arrows don't hide them.
- Print and "Fit" include the lane headers.
- README: documented all editor shortcuts, "Edit character", project layout, and known limitations;
  the local (non-Docker) run example now uses port 8000.

## [0.2.0] - 2026-10-14

### Added
- Dockerfile and `compose.yaml`: runs under gunicorn as a non-root user, on host port 5050 by default
  (`CHARFLOW_PORT` overrides it), with the SQLite database stored in a named volume.
- Docker usage, backup, and update instructions in the README.

### Changed
- gunicorn is now a runtime dependency.

## [0.1.0] - 2026-10-13

### Added
- Flask + SQLite JSON API for saving named flowcharts (list, create, get, update/rename, delete, copy).
- Chart list: create, open, rename, duplicate, delete.
- Character questionnaire: name, class, level, editable ability scores with computed modifiers,
  weapons, spells, features, notes.
- Sidebar palette built from the questionnaire, with generic flow cards; drag or click to add.
- Left-to-right flowchart editor: colored boxes with editable multi-line text, move, resize,
  snap to grid, pan and zoom.
- Arrows anchored only at side midpoints, routed with right angles, follow boxes as they move,
  optional labels.
- Suggested arrows shown faintly for the selected box; click to accept. Suggestions never pass
  through another box.
- Autosave plus Save button and Ctrl/Cmd+S.
- Print to a single landscape letter page with a character summary header (Save as PDF works from
  the print dialog).
- Python API tests, Node logic tests, and Playwright end-to-end tests.
