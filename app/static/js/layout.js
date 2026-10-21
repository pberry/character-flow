// Swim-lane layout. Lanes stack top to bottom and grow to fit their boxes.
// Boxes store `y` relative to their lane's top, so a lane growing never
// requires rewriting the boxes below it. Pure functions, no DOM.

import { badgeOverhang } from "./badges.js";
import { layoutSidebar, sideWidth } from "./sidebar.js";

export const HEADER_W = 150;     // lane header column, drawn left of x = 0
export const LANE_PAD = 20;      // space below the lowest box in a lane
export const MIN_LANE_H = 110;
export const BOX_MIN_X = 20;     // boxes stay right of the header column
export const BOX_MIN_Y = 10;     // ...and below their lane's top edge

// The lane header is a flag inset in the header column. Badges on it stack
// inward, and the flag shrinks to keep them inside the lane and the header
// column, clear of the page's left edge and of badges on the lane's boxes.
const HEADER_INSET = 10;
const HEADER_RIGHT = -20;        // the flag's right edge without badges
const HEADER_REACH = -4;         // header badges end this far right of x = 0
const HEADER_MIN_H = 60;
export const HEADER_BADGES = { inward: true };

// Space around the flag in its lane, from its badges. Badge positions on a
// flag barely depend on its size, so a nominal size is used.
export function headerInsets(lane) {
  const nominal = { w: HEADER_W + HEADER_RIGHT - HEADER_INSET, h: 100, shape: "flag", badges: lane.badges };
  const over = badgeOverhang(nominal, HEADER_BADGES);
  const pad = (n) => Math.max(HEADER_INSET, Math.ceil(n) + 4);
  return {
    top: pad(over.top),
    bottom: pad(over.bottom),
    left: pad(over.left),
    right: Math.max(-HEADER_RIGHT, Math.ceil(over.right) - HEADER_REACH),
  };
}

// The flag's absolute rectangle in a lane placed at `top` with `height`.
function placeHeader(lane, top, height) {
  const ins = headerInsets(lane);
  const x = -HEADER_W + ins.left;
  return { x, y: top + ins.top, w: Math.max(40, -ins.right - x), h: height - ins.top - ins.bottom, shape: "flag", badges: lane.badges || [] };
}

// The chart is a fixed page width so it always prints at a readable size
// (14px box text comes out around 9pt). Lanes grow downward, never sideways.
export const CONTENT_W = 1000;
export const BOX_MAX_RIGHT = CONTENT_W - 20;   // boxes end left of this x
// A tracker side column takes its width from the lanes, so the page (and the
// print scale) stays the same.
export const contentWidth = (chart) => CONTENT_W - sideWidth(chart);
export const boxMaxRight = (chart) => BOX_MAX_RIGHT - sideWidth(chart);
export const PAGE_W = HEADER_W + CONTENT_W;
// Printable chart area on letter paper, per orientation (see print.css).
// Portrait keeps the same canvas width, so it prints smaller but fits a much
// taller chart. Character notes print in a strip under the chart, which takes
// its height from the chart area.
export const PRINT_SIZES_IN = { landscape: { w: 10.2, h: 6.8 }, portrait: { w: 7.7, h: 9.3 } };
export const ORIENTATIONS = Object.keys(PRINT_SIZES_IN);
export const PRINT_W_IN = PRINT_SIZES_IN.landscape.w;
export const PRINT_H_IN = PRINT_SIZES_IN.landscape.h;
export const NOTES_H_IN = 0.8;
export const PRINT_ASPECT = PRINT_W_IN / PRINT_H_IN;
export const PRINT_PAD = 4;
const pageHFor = (aspect) => Math.floor((PAGE_W + 2 * PRINT_PAD) / aspect - 2 * PRINT_PAD);
// Height that still prints at full scale in landscape; anything taller shrinks the page.
export const PAGE_H = pageHFor(PRINT_ASPECT);

export const orientation = (chart) => (chart.orientation === "portrait" ? "portrait" : "landscape");
export const hasNotes = (chart) => !!(chart.character?.notes || "").trim();
export function printAspect(chart) {
  const { w, h } = PRINT_SIZES_IN[orientation(chart)];
  return w / (h - (hasNotes(chart) ? NOTES_H_IN : 0));
}
export const pageHeight = (chart) => pageHFor(printAspect(chart));

// `frozen`: lane geometry to reuse instead of recomputing (used while dragging
// so lanes don't jump around under the pointer).
// `floating`: {id, x, y} absolute position of a box being dragged.
export function layoutChart(chart, { frozen = null, floating = null } = {}) {
  const firstLane = chart.lanes[0]?.id;
  const laneOf = (box) => (chart.lanes.some((l) => l.id === box.lane) ? box.lane : firstLane);

  let lanes;
  if (frozen) {
    lanes = chart.lanes.map((lane) => {
      const f = frozen.find((g) => g.id === lane.id);
      const top = f ? f.top : 0, height = f ? f.height : MIN_LANE_H;
      return { ...lane, top, height, header: placeHeader(lane, top, height) };
    });
  } else {
    let top = 0;
    lanes = chart.lanes.map((lane) => {
      let bottom = 0;
      for (const b of chart.boxes) {
        // Badges hanging below a box count too, so they don't spill into the next lane.
        if (laneOf(b) === lane.id) bottom = Math.max(bottom, b.y + b.h + badgeOverhang(b).bottom);
      }
      const ins = headerInsets(lane);
      const height = Math.max(MIN_LANE_H, bottom + LANE_PAD, ins.top + ins.bottom + HEADER_MIN_H);
      const placed = { ...lane, top, height, header: placeHeader(lane, top, height) };
      top += height;
      return placed;
    });
  }
  const tops = new Map(lanes.map((l) => [l.id, l.top]));

  const boxes = chart.boxes.map((b) =>
    floating && floating.id === b.id
      ? { ...b, x: floating.x, y: floating.y }
      : { ...b, lane: laneOf(b), y: (tops.get(laneOf(b)) ?? 0) + b.y },
  );

  // Boxes are clamped to BOX_MAX_RIGHT, but never hide one that isn't.
  const right = boxes.reduce((m, b) => Math.max(m, b.x + b.w + badgeOverhang(b).right + 20), 0);
  const last = lanes[lanes.length - 1];
  const sideW = sideWidth(chart);
  const contentW = contentWidth(chart);
  const left = -HEADER_W - sideW;
  const sidebar = layoutSidebar(chart.sidebar, left);
  return {
    lanes,
    boxes,
    sidebar,
    left,
    width: sideW + HEADER_W + Math.max(contentW, right),
    lanesLeft: -HEADER_W,
    contentW,
    lanesHeight: last ? last.top + last.height : 0,
    height: Math.max(last ? last.top + last.height : 0, sidebar.height),
    pageH: pageHeight(chart),
    notes: hasNotes(chart),
    orientation: orientation(chart),
  };
}

// The lane containing world y. Above the first lane counts as the first,
// below the last counts as the last.
export function laneAt(layout, y) {
  const { lanes } = layout;
  if (!lanes.length) return null;
  for (const lane of lanes) {
    if (y < lane.top + lane.height) return lane;
  }
  return lanes[lanes.length - 1];
}

export function layoutBounds(layout) {
  return { x: layout.left, y: 0, w: layout.width, h: layout.height };
}

// Where to put a new w x h box in a lane, starting from the lane-relative spot
// `x, y`: slide right past boxes in the way, and wrap to a new row at the left
// when the page's right edge (`maxRight`) is reached. `boxes` are lane-relative.
export const SLOT_GAP_X = 40;
export const SLOT_GAP_Y = 30;
export function findSlot(boxes, { x, y, w, h }, maxRight = BOX_MAX_RIGHT) {
  const overlaps = (b) =>
    x < b.x + b.w + SLOT_GAP_X / 2 && b.x < x + w + SLOT_GAP_X / 2 &&
    y < b.y + b.h + SLOT_GAP_Y / 2 && b.y < y + h + SLOT_GAP_Y / 2;
  x = Math.max(BOX_MIN_X, x);
  y = Math.max(BOX_MIN_Y, y);
  for (let i = 0; i < 1000; i++) {
    if (x + w > maxRight) {
      x = BOX_MIN_X;
      y += h + SLOT_GAP_Y;
      continue;
    }
    const hit = boxes.find(overlaps);
    if (!hit) break;
    x = hit.x + hit.w + SLOT_GAP_X;
  }
  return { x, y };
}

// Lane-relative spot after the last box in a lane: the start of its lowest
// row, slid right past what's already there.
export function endOfLane(boxes, { w, h }, maxRight = BOX_MAX_RIGHT) {
  if (!boxes.length) return { x: BOX_MIN_X, y: BOX_MIN_Y };
  const lastRow = Math.max(...boxes.map((b) => b.y));
  return findSlot(boxes, { x: BOX_MIN_X, y: lastRow, w, h }, maxRight);
}
