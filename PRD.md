# Character Flow — Product Requirements

> **Living document.** Update this file whenever a goal, decision, or requirement changes, in the same change
> that implements it. Record *why* a decision was made, not just what. Last updated for **v1.1.0**.

## Problem

Generic "what can I do on my turn" combat flowcharts don't fit a specific character. Character Flow lets a player
build a one-page, character-specific combat flowchart and print it to keep at the table.

## Users

- **Players and game masters, no accounts.** Anyone can make a chart. A chart belongs to whoever holds its edit link.
- **Real players use it now** (since 2026-10-20), so losing a saved chart is the worst failure the app can have.
  Defacing someone else's chart must not be possible.
- **Public** at [characterflow.app](https://characterflow.app), hosted on Fly.io. Running costs must stay at a
  few dollars a month.

## Goals

1. Answer a short questionnaire about the character and get a palette of that character's options.
2. Build a turn flowchart as **swim lanes** (one lane per part of the turn), using LucidChart-style boxes and
   arrows, with as little friction as possible.
3. Print the chart on **one sheet of 8.5x11 color paper**, landscape or portrait, readable at the table.
4. Save charts and come back to them later with a private link, and share a read-only link with the table.
5. Explain itself on the home page to people who have never heard of it.

## Non-goals (for now)

- Accounts, passwords, or sign-in. Links replace them.
- Real-time collaboration.
- Undo or version history ([#9](https://github.com/pberry/character-flow/issues/9)). Use Duplicate as a snapshot.
- Rules knowledge: the app is **system-agnostic** and doesn't validate anything against D&D rules.
- Multi-page charts.

## Requirements

### Intro questionnaire
- Asks for the character's name, class, and level; ability scores; weapons; spells; features; and free-form notes.
- **Free text throughout.** The only computation is ability modifiers, `floor((score - 10) / 2)`.
- Ability names can be edited (system-agnostic). The defaults are STR, DEX, CON, INT, WIS, and CHA.
- Answers feed **only the sidebar palette**. The canvas starts empty, and re-editing the character never changes
  boxes already on the canvas.
- Can be reopened at any time with "Edit character".

### Canvas
- **Swim lanes** run top to bottom. The defaults are Start of turn, Attack, Bonus Actions, Reactions, and
  Other Actions. You can rename, recolor, reorder, add, and remove lanes. A chart always has at least one lane.
- Lane height adjusts automatically to fit the lane's boxes.
- Flow inside a lane runs left to right.
- **Boxes** have a color, a shape, and editable multi-line text (the first line is bold), and you can move and
  resize them. Arrows follow boxes when they move.
- **Shapes**: rectangle (default), flag, diamond, star, document, right arrow, up arrow. They tell boxes apart and
  carry no enforced meaning. Arrows meet the outline at each side's midpoint. Lane headers are flags, and the
  "Decision?" card starts as a diamond.
- A box **keeps its color** when moved to another lane. The lane color is only the default for "Blank box" cards.
- **Badges** on box corners show cost, duration, recharge, or a modifier: free text, with a shape, color, and
  corner per type (circle top right, pill top left, plus bottom right, triangle bottom left). A badge can be
  selected and given its own color; otherwise it uses its type's. Badges attach to boxes, tracker items, and lane
  headers. On shaped boxes they sit on the outline nearest their corner, and lanes grow to fit them. On a lane header
  they stack inward and the flag shrinks to keep them inside the lane.
- **Arrows** anchor only at the **midpoint of a box side**. You can add a label to an arrow (e.g. yes/no).
- **Suggested arrows**: when a box is selected, faint dashed arrows to nearby boxes appear; one click makes a
  suggestion real. Suggestions that would cross another box are not offered.
- **Fixed page width** (v0.4.0). The canvas is one printed page wide and boxes can't go past the right edge.
  When cards are clicked into a full row they **wrap to a new row** in that lane. Boxes already placed are
  **never rearranged automatically**, because hand placement (branches, alignment) is part of the chart.
- A **page-bottom guide** shows where the printed page ends and turns red when lanes run past it.

- **Groups** draw a bracket (open on the left) or outline around related boxes, with an optional label. Build one
  by Shift-clicking boxes and choosing "Group". The line is computed from its boxes, so it follows them.

### Side column
- An optional **tracker column** left of the lanes holds what isn't part of the turn: gear, resource pools, healing,
  and conditions. It starts with those four sections, which can be renamed, reordered, added, and deleted.
- **Items stack automatically** in their section (no hand placement). An item has text, up to 20 **tick circles**
  to mark in pencil, badges, and an optional color (white by default).
- The column **takes its width from the lanes** (200 units, about four boxes per row instead of five), so the print
  scale is unchanged. Boxes past the narrower edge are pulled back in.

### Saving and links
- Charts are saved in SQLite. Names don't have to be unique. Charts can be renamed, duplicated, and deleted.
- Changes autosave 2 seconds after the last edit. Ctrl/Cmd+S saves immediately.
- Each chart has an **edit link** and a **view link**, both with 128-bit random keys in the URL fragment. The
  edit link reads, saves, renames, and deletes; the view link only reads, prints, and copies. Only a hash of the
  edit key is stored. Unknown keys get a 404.
- There is **no list of all charts** in the app. The home page lists the charts this browser has opened. A new
  chart opens with a "bookmark your chart" dialog, and the editor's Links button shows both links.
- A lost edit link can be replaced by the operator (`python -m app.admin reset-link`), never looked up.
- Abuse limits: request bodies up to 1MB, a cap on the total number of charts, and a per-client hourly limit on
  new charts and copies.

### Hosting and backups
- Fly.io, one machine that stops when idle, with SQLite on a volume. Deploys run from GitHub Actions when a
  release tag is pushed, after the tests pass and a volume snapshot is taken.
- Litestream streams the database to a Tigris bucket (Fly's object storage) and restores an empty volume from it. Fly keeps daily volume
  snapshots for 30 days.
- Locally, the Docker setup still snapshots the database every hour into a host folder outside the data volume.
  Unchanged data isn't snapshotted again. The newest 48 snapshots are kept, plus the last one of each day for 90
  days.

### Home page
- Says what the app is, who it's for, and how it works, and explains links instead of accounts.
- Shows a short, silent, looping video of a chart being built (paused for players who prefer reduced motion),
  recorded by a script so it can be refreshed after UI changes. Room for more screenshots or videos.
- Links to an example chart (the one in the video), shown read-only with Print and Make a copy, so a new player
  doesn't have to start from a blank page.

### Static pages
- Hand-written HTML pages (starting with an FAQ) share the app's styles, header, and footer.
- Adding a page means adding one file; there is no CMS or in-app editing.

### Printing
- The browser's Print button produces one letter page with a character summary header. Use
  "Save as PDF" in the print dialog to get a PDF.
- Each chart has a print orientation, landscape (the default) or portrait, saved with the chart. Portrait keeps
  the canvas width, so it prints at about 75% of the landscape scale on a page about 1.8x as tall. The editor's
  page-bottom guide follows the orientation.
- Charts that fit the page print at a fixed scale, so 14px box text prints at about 9pt. Taller charts are scaled
  down to fit on one page rather than spilling onto a second.
- Colors print, because `print-color-adjust: exact` is set.
- The character's notes print in a strip under the chart (up to four lines). The chart area gives up that height
  only when there are notes, and the editor's page-bottom guide moves up to match.

## Decisions log

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-14 | Flask + stdlib sqlite3 + vanilla JS/SVG, no build step | Boring technology for a hobby project, easy to maintain |
| 2026-10-14 | Chart stored as one JSON blob per row | Keeps the schema trivial while the data model evolves |
| 2026-10-14 | Intro answers feed only the palette | The player stays in control of what goes on the chart |
| 2026-10-14 | Free text, system-agnostic | Works for any edition or game; avoids encoding rules |
| 2026-10-14 | Print scales to one landscape page | One sheet at the table is the whole point |
| 2026-10-14 | Docker on host port 5050 | Port 5000 (and 8080) are already in use on the host |
| 2026-10-14 | Swim lanes, editable, with five defaults; automatic lane height | Matches how the player's Lucidchart mock-up is organized |
| 2026-10-14 | Box keeps its color across lanes | "Let the user figure it out": color often means something other than the lane |
| 2026-10-14 | Data format v2 with a fresh database, no migration | No real data existed yet |
| 2026-10-14 | Fixed page width, wrap new cards, no automatic reflow, page-bottom guide | Keep printouts readable; respect hand placement |
| 2026-10-16 | Box shapes (flag, diamond, star, document, block arrow) suggest a use but carry no enforced meaning | The mock-up picked shapes to tell boxes apart, not for their ISO flowchart meanings |
| 2026-10-16 | Four badge types, each with its own shape: cost (circle), duration (not a circle), recharge (plus), modifier (triangle) | The mock-up drew cost and duration as the same circle; separate shapes keep them distinct in print |
| 2026-10-16 | Lane headers drawn as flags | The player described the start of a swim lane as a flag |
| 2026-10-16 | Arrows meet a shape's outline, not its bounding box | Arrows ending in empty space beside a star point or diamond edge look wrong |
| 2026-10-16 | One corner per badge type: cost top right, duration top left, recharge bottom right, modifier bottom left | Corners keep badges off the side midpoints where arrows attach; cost and recharge match the mock-up |
| 2026-10-16 | Duration badge is a pill | Fits text better than an hourglass and still reads differently from the cost circle |
| 2026-10-16 | Side column takes its width from the lanes, not the print scale | Readable text at the table matters more than a fifth box per row |
| 2026-10-16 | Side column is a structured list (sections of auto-stacked items), not free-placed boxes | Less fiddly to edit, consistent printouts, and real tick circles for resource counts |
| 2026-10-16 | Groups get a label, not badges | Keeps the earlier "badges on boxes only" decision; a label like "While attuned" covers the mock-up's use |
| 2026-10-16 | Group outline is computed from its boxes, never stored | It follows boxes for free and can't drift out of date |
| 2026-10-16 | Multi-select with Shift-click (no drag-to-select yet) | Smallest change that makes grouping possible; matches Lucidchart |
| 2026-10-16 | Badges attach to boxes only, not lanes or rows | Keep it simple for now |
| 2026-10-16 | No border-weight styling | Thick borders in the mock-up were accidental |
| 2026-10-20 | Hourly database snapshots by a separate backup container, into a host folder | Real players now; backups must survive a deleted volume, and a separate read-only container can't damage the live data or slow the app |
| 2026-10-20 | Snapshots use SQLite's online backup API and skip unchanged data | Safe while the app runs, and quiet weeks don't push older snapshots out |
| 2026-10-20 | Tracker items get an optional color from the same swatches as boxes | Player feedback; reusing the box swatches keeps printed colors consistent |
| 2026-10-20 | Badges are selectable, and a selected badge can override its type's color | Player feedback; the shape still identifies the type, so color is free for the player's own meaning |
| 2026-10-20 | Clicking a badge selects it, but dragging it still moves its box | Selecting badges shouldn't make boxes harder to move |
| 2026-10-20 | Lane headers can have badges (reverses "badges on boxes only") | Player request; header badges stack inward and the flag shrinks so they never spill into other lanes or onto boxes |
| 2026-10-20 | Notes print in a strip under the chart, which gets shorter only when there are notes | The player chose this over the header (too little room) or a second page (one sheet at the table) |
| 2026-10-21 | Per-chart print orientation; portrait keeps the canvas width and prints smaller | Tall charts shrank too much on a landscape page. Keeping the width means no boxes move when switching, at the cost of smaller text in portrait |
| 2026-10-23 | Host publicly on Fly.io (one auto-stopping machine plus a volume) | Cost is the main constraint. The app stays Flask and SQLite with no rewrite, and idle time costs almost nothing |
| 2026-10-23 | Secret edit and view links instead of accounts | No sign-up for players, but charts can't be found or defaced by strangers. A view link lets the table see a chart without being able to change it |
| 2026-10-23 | Store only a hash of edit keys | A leaked database or backup can't be used to edit charts. The cost is that a lost link can be reissued but not recovered |
| 2026-10-23 | Chart names are no longer unique; no global chart list | On a public site, one player's "Meren" must not block another's, and nobody should see other people's charts |
| 2026-10-23 | The home page lists charts from the browser's local storage | Returning players find their charts without accounts or a server-side list |
| 2026-10-23 | Litestream to a Tigris bucket on Fly, plus Fly volume snapshots | The hourly backup container can't run on a machine that sleeps, and Litestream runs only while the app does. Tigris over Cloudflare R2: one account, and `fly storage create` sets the keys, at the cost of keeping backups with the same provider as the data |
| 2026-10-23 | Deploy from release tags in GitHub Actions, with a volume snapshot first | Matches the existing release habit (check the docs, then tag). Migrations touch the only copy of players' data |
| 2026-10-23 | SQLite WAL mode only when `CHARFLOW_WAL=1` | Litestream needs WAL, but the local backup container reads the database from a read-only mount, which WAL can break |
| 2026-10-24 | Release public hosting as v1.0.0, not v0.11.0 | It's the first public release, and it breaks old `#/chart/<id>` links, so a major version marks both |
| 2026-10-24 | Fix the audit's low-severity findings now; track the storage budget, Litestream checksum, and digest pinning as issues | The header, redirect, and parsing fixes are small and testable. The other three change capacity limits, the image build, or CI, so each gets its own change ([#23](https://github.com/pberry/character-flow/issues/23), [#24](https://github.com/pberry/character-flow/issues/24), [#25](https://github.com/pberry/character-flow/issues/25)) |
| 2026-10-24 | Example charts ship as static JSON (`app/static/examples/<name>.json`) at `#/example/<name>`, not as a database chart behind a view link | A view link would only work on the one server whose database holds that chart; a static file works on every install, is versioned with the code, and is regenerated with the demo video so the two always match |
| 2026-10-24 | Home page demo is an MP4 recorded by a Playwright script, not a GIF or hand-made screen capture | Playwright is already a dev dependency and records video directly; MP4 is about a tenth the size of an equivalent GIF and sharper. A script keeps the demo reproducible when the UI changes. Uses a made-up rogue so no real player's character is shown |
| 2026-10-24 | Static pages are Jinja templates extending one base layout, served at `/<name>` | The FAQ is the first of possibly several pages. Flask already ships Jinja, so pages share one head and footer with no new dependency, build step, or CMS; the owner writes the HTML |
| 2026-10-24 | Pin actions by commit SHA and base images by digest, updated by monthly Dependabot PRs | A moved tag in the deploy job could take over the app with `FLY_API_TOKEN`. Dependabot keeps the pins from going stale, so base-image security fixes still arrive, as reviewable PRs |
| 2026-10-24 | Limit new charts to 20 per client IP per sliding hour, counted in memory | One machine with one worker sees every request, so no new dependency or store is needed. The hour is generous enough for a GM making charts for a table on shared Wi-Fi, yet one IP can't fill the 5000-chart cap. The client IP header is trusted only when configured, so it can't be forged around the limit off Fly |
| 2026-10-21 | Arrow keys nudge selected boxes within their lane (10px, Shift 50px); lanes and other selections don't nudge | Player request for fine positioning. Crossing lanes stays a drag so a stray keypress can't move a box to a different lane; multi-selections move as a unit so their spacing is kept |

## Roadmap

Shipped from the mock-up: box shapes and flag lane headers ([#3](https://github.com/pberry/character-flow/issues/3), v0.5.0);
badges on boxes ([#2](https://github.com/pberry/character-flow/issues/2), v0.6.0); tracker side column
([#1](https://github.com/pberry/character-flow/issues/1), v0.7.0); grouping brackets
([#4](https://github.com/pberry/character-flow/issues/4), v0.8.0). Those were all the items from the player's
Lucidchart mock-up of Meren (a Wood Elf Monk, Warrior of the Elements, level 3), which is kept out of the repo.

Shipped in v0.9.0, once real players were using it: automatic database backups
([#10](https://github.com/pberry/character-flow/issues/10)), and from player feedback, colors for tracker items
([#11](https://github.com/pberry/character-flow/issues/11)), badges on lane headers
([#12](https://github.com/pberry/character-flow/issues/12)), custom badge colors
([#13](https://github.com/pberry/character-flow/issues/13)), and printed notes
([#14](https://github.com/pberry/character-flow/issues/14)).

Shipped in v0.10.0: portrait printing for tall charts ([#15](https://github.com/pberry/character-flow/issues/15)).

Shipped in v1.0.0: public hosting at characterflow.app with secret edit and view links, a new home page, and
arrow-key nudging for selected boxes ([#17](https://github.com/pberry/character-flow/issues/17)).

Tracked as GitHub issues:
- [#5](https://github.com/pberry/character-flow/issues/5) Questionnaire: choose a lane per weapon, spell, or feature
- [#6](https://github.com/pberry/character-flow/issues/6) Route arrows around boxes
- [#7](https://github.com/pberry/character-flow/issues/7) Keep lane headers visible when panning
- [#8](https://github.com/pberry/character-flow/issues/8) Touch support
- [#9](https://github.com/pberry/character-flow/issues/9) Undo and version history
- [#23](https://github.com/pberry/character-flow/issues/23) Cap total stored bytes, not just the chart count
- [#24](https://github.com/pberry/character-flow/issues/24) Verify the Litestream download's checksum

## Constraints

- Python with `uv`-managed virtual environments. Tests are required for every change: pytest for the API and
  end-to-end tests, and `npm test` (Node's built-in runner) for the pure JavaScript logic.
- Small commits and semver tags. Introduce ADRs as the project approaches 2.0; until then this decisions log
  serves that purpose.
- Any port you choose must be confirmed free on the host first.
- Hosting costs stay at a few dollars a month. Prefer scale-to-zero and free tiers over always-on services.
