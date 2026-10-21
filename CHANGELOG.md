# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Automatic backups: a `backup` service in `compose.yaml` snapshots the database every hour into `./backups/` on
  the host. Unchanged data is skipped, and old snapshots are thinned out (the newest 48, plus one a day for 90 days).
  The README explains how to restore one.

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
