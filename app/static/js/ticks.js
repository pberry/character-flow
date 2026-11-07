// Tick circles: a count printed as empty circles to mark in pencil (uses,
// charges). Tracker items and boxes both have them. On a box they sit inside
// the outline at the bottom of the text area, so they never meet the arrows
// (which attach to the outline's side midpoints) or the corner badges.
// Pure functions in box-local coordinates, no DOM.

import { layoutBadges } from "./badges.js";
import { shapePoints, textArea } from "./shapes.js";

export const TICK = 16;      // spacing of the circles
export const TICK_R = 5.5;   // radius: smaller than the smallest badge
export const MAX_COUNT = 20;
const PAD = 4;               // between the circles and the text area's edges

export const clampCount = (n) => Math.max(0, Math.min(MAX_COUNT, Math.floor(Number(n)) || 0));

// Where a horizontal line at y crosses the outline: the stretch around the
// box's center line (or the nearest one), or null if it misses the shape.
function spanAt(pts, w, y) {
  const xs = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if ((p.y <= y) !== (q.y <= y)) xs.push(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x));
  }
  xs.sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const span = [xs[i], xs[i + 1]];
    const dist = span[0] <= w / 2 && w / 2 <= span[1] ? 0 : Math.min(Math.abs(span[0] - w / 2), Math.abs(span[1] - w / 2));
    if (!best || dist < best.dist) best = { span, dist };
  }
  return best?.span || null;
}

// The usable width for a row of circles centered at y: the outline's width
// across the whole circle height, cut to the text area and kept clear of any
// badge that reaches into the row.
function rowSpan(pts, w, ta, badges, y) {
  let lo = ta.x, hi = ta.x + ta.w;
  if (pts) {
    for (const yy of [y - TICK_R, y, y + TICK_R]) {
      const span = spanAt(pts, w, yy);
      if (!span) return [w / 2, w / 2];
      lo = Math.max(lo, span[0]);
      hi = Math.min(hi, span[1]);
    }
  }
  for (const b of badges) {
    if (b.y - b.h / 2 >= y + TICK_R + 1 || b.y + b.h / 2 <= y - TICK_R - 1) continue;
    if (b.x < w / 2) lo = Math.max(lo, b.x + b.w / 2 + 1 - PAD);
    else hi = Math.min(hi, b.x - b.w / 2 - 1 + PAD);
  }
  return hi > lo ? [lo, hi] : [w / 2, w / 2];
}

// Circle centers for a box's `count` ticks, and the text area left above
// them. `box` is {shape, w, h, count, badges}. Each row is centered and fits
// the outline at its height and the badges beside it, so narrow shapes get
// shorter rows.
export function layoutTicks(box) {
  const { shape, w, h } = box;
  const ta = textArea(shape, w, h);
  const n = clampCount(box.count);
  if (!n) return { ticks: [], text: ta };
  const pts = shapePoints(shape, w, h);
  const badges = layoutBadges({ ...box, shape: shape || "rect" });
  // Rows from the bottom up, until there's room for every circle.
  const rows = [];
  let room = 0;
  for (let y = ta.y + ta.h - PAD - TICK / 2; room < n && rows.length < MAX_COUNT; y -= TICK) {
    const [lo, hi] = rowSpan(pts, w, ta, badges, y);
    const fit = Math.max(1, Math.floor((hi - lo - 2 * PAD) / TICK));
    rows.unshift({ y, fit, mid: (lo + hi) / 2 });
    room += fit;
  }
  // Spread them evenly over the rows (top rows first when they don't divide),
  // so a last row never holds a lone circle.
  const ticks = [];
  let left = n;
  for (const [i, row] of rows.entries()) {
    const later = rows.slice(i + 1).reduce((sum, r) => sum + r.fit, 0);
    const take = Math.min(row.fit, Math.max(left - later, Math.ceil(left / (rows.length - i))));
    for (let i = 0; i < take; i++) ticks.push({ x: row.mid + (i - (take - 1) / 2) * TICK, y: row.y });
    left -= take;
  }
  const top = rows[0].y - TICK / 2;
  return { ticks, text: { ...ta, h: Math.max(0, top - ta.y) } };
}

// The smallest height, a multiple of `grid` and at least `minH`, at which
// `box` leaves `textH` of text area above its circles.
export function fitHeight(box, textH, { minH = 30, grid = 10 } = {}) {
  let h = Math.ceil(minH / grid) * grid;
  for (let i = 0; i < 500; i++, h += grid) {
    if (layoutTicks({ ...box, h }).text.h >= textH - 0.5) return h;
  }
  return h;
}

// The height `box` should be with `count` circles instead of its current
// ones. Each bare height (the box with no circles, on the grid) grows to the
// smallest grid height that keeps its text room, nudged so a taller bare box
// always grows taller. That makes the growth reversible: stepping the count up
// and down lands on the same height for the same count, where keeping text
// room step by step would creep from rounding to the grid.
export function heightForCount(box, count, { minH = 30, grid = 10 } = {}) {
  const opts = { minH, grid };
  const old = clampCount(box.count), n = clampCount(count);
  const fit = (bare, c) => fitHeight({ ...box, count: c }, layoutTicks({ ...box, h: bare, count: 0 }).text.h, opts);
  const start = Math.ceil(minH / grid) * grid;
  const bareNow = Math.max(start, Math.ceil(box.h / grid) * grid); // when there are no circles yet
  let grownOld = -Infinity, grownNew = -Infinity;
  for (let bare = start, i = 0; i < 1000; bare += grid, i++) {
    grownOld = old ? Math.max(fit(bare, old), grownOld + grid) : bare;
    grownNew = n ? Math.max(fit(bare, n), grownNew + grid) : bare;
    // The current bare height: the first that grows to at least the box's height.
    if (old ? grownOld >= box.h : bare >= bareNow) break;
  }
  return grownNew;
}
