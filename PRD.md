# Character Flow — Product Requirements

> **Living document.** Update this file whenever a goal, decision, or requirement changes, in the same change
> that implements it. Record *why* a decision was made, not just what. Last updated for **v0.9.0**.

## Problem

Generic "what can I do on my turn" combat flowcharts don't fit a specific character. Character Flow lets a player
build a one-page, character-specific combat flowchart and print it to keep at the table.

## Users

- **One player at a time.** The project owner builds charts for, and with, a player. Single user, no accounts.
- **Real players use it now** (since 2026-10-20), so losing a saved chart is the worst failure the app can have.
- Runs on a home LAN. Not exposed to the internet.

## Goals

1. Answer a short questionnaire about the character and get a palette of that character's options.
2. Build a turn flowchart as **swim lanes** (one lane per part of the turn), using LucidChart-style boxes and
   arrows, with as little friction as possible.
3. Print the chart on **one sheet of 8.5x11 color paper**, landscape or portrait, readable at the table.
4. Save charts by name and come back to them later.

## Non-goals (for now)

- Multiple users, authentication, sharing, or real-time collaboration.
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

### Saving
- Charts are saved by unique name in SQLite. You can rename, duplicate, and delete them.
- Changes autosave 2 seconds after the last edit. Ctrl/Cmd+S saves immediately.
- The Docker setup snapshots the database every hour into a host folder outside the data volume. Unchanged
  data isn't snapshotted again. The newest 48 snapshots are kept, plus the last one of each day for 90 days.

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

Tracked as GitHub issues:

- [#15](https://github.com/pberry/character-flow/issues/15) Print in portrait orientation for tall charts (done, unreleased)
- [#5](https://github.com/pberry/character-flow/issues/5) Questionnaire: choose a lane per weapon, spell, or feature
- [#6](https://github.com/pberry/character-flow/issues/6) Route arrows around boxes
- [#7](https://github.com/pberry/character-flow/issues/7) Keep lane headers visible when panning
- [#8](https://github.com/pberry/character-flow/issues/8) Touch support
- [#9](https://github.com/pberry/character-flow/issues/9) Undo and version history

## Constraints

- Python with `uv`-managed virtual environments. Tests are required for every change: pytest for the API and
  end-to-end tests, and `npm test` (Node's built-in runner) for the pure JavaScript logic.
- Small commits and semver tags. Introduce ADRs as the project approaches 2.0; until then this decisions log
  serves that purpose.
- Any port you choose must be confirmed free on the host first.
