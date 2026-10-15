# Repo instructions

## Living documents

`PRD.md`, `README.md`, and `CHANGELOG.md` are living documents. Keep them current **in the same commit or PR as the
code change**, not as a later cleanup:

- **PRD.md**: update it when a goal, requirement, or product decision changes, or when the user makes a decision
  in conversation. Add a row to the decisions log with the date and the *why*. Keep the roadmap in sync with
  GitHub issues, and bump the "Last updated for" version on release.
- **README.md**: update it when user-visible behavior, shortcuts, setup, ports, project layout, or known
  limitations change.
- **CHANGELOG.md**: add every user-visible change under the version being released, following
  Keep a Changelog. Never release without an entry.

Before tagging a release, check all three documents against what shipped.

## Workflow

- Small commits and semver tags (`vX.Y.Z`). Track follow-up work as GitHub issues (`gh issue create`).
- Tests are required: `uv run pytest` (API and Playwright e2e) and `npm test` (pure JS). Both must pass before a
  commit.
- Boring technology: Flask, sqlite3, vanilla ES modules, and SVG. No frontend build step.
- Docker serves on host port 5050 (`compose.yaml`). Confirm any new port is free before using it.
- `Meren abilities.pdf` is a local reference mock-up and is never committed.
