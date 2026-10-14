# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
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
