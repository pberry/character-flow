// Swim-lane layout. Lanes stack top to bottom and grow to fit their boxes.
// Boxes store `y` relative to their lane's top, so a lane growing never
// requires rewriting the boxes below it. Pure functions, no DOM.

export const HEADER_W = 150;     // lane header column, drawn left of x = 0
export const LANE_PAD = 20;      // space below the lowest box in a lane
export const MIN_LANE_H = 110;
export const BOX_MIN_X = 20;     // boxes stay right of the header column
export const BOX_MIN_Y = 10;     // ...and below their lane's top edge

// The chart is a fixed page width so it always prints at a readable size
// (14px box text comes out around 9pt). Lanes grow downward, never sideways.
export const CONTENT_W = 1000;
export const BOX_MAX_RIGHT = CONTENT_W - 20;   // boxes end left of this x
export const PAGE_W = HEADER_W + CONTENT_W;
// Printable chart area on landscape letter is 10.2 x 6.8in (see print.css).
export const PRINT_ASPECT = 10.2 / 6.8;
export const PRINT_PAD = 4;
// Height that still prints at full scale; anything taller shrinks the page.
export const PAGE_H = Math.floor((PAGE_W + 2 * PRINT_PAD) / PRINT_ASPECT - 2 * PRINT_PAD);

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
      return { ...lane, top: f ? f.top : 0, height: f ? f.height : MIN_LANE_H };
    });
  } else {
    let top = 0;
    lanes = chart.lanes.map((lane) => {
      let bottom = 0;
      for (const b of chart.boxes) {
        if (laneOf(b) === lane.id) bottom = Math.max(bottom, b.y + b.h);
      }
      const height = Math.max(MIN_LANE_H, bottom + LANE_PAD);
      const placed = { ...lane, top, height };
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
  const right = boxes.reduce((m, b) => Math.max(m, b.x + b.w + 20), 0);
  const last = lanes[lanes.length - 1];
  return {
    lanes,
    boxes,
    left: -HEADER_W,
    width: HEADER_W + Math.max(CONTENT_W, right),
    height: last ? last.top + last.height : 0,
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
// when the page's right edge is reached. `boxes` are lane-relative.
export const SLOT_GAP_X = 40;
export const SLOT_GAP_Y = 30;
export function findSlot(boxes, { x, y, w, h }) {
  const overlaps = (b) =>
    x < b.x + b.w + SLOT_GAP_X / 2 && b.x < x + w + SLOT_GAP_X / 2 &&
    y < b.y + b.h + SLOT_GAP_Y / 2 && b.y < y + h + SLOT_GAP_Y / 2;
  x = Math.max(BOX_MIN_X, x);
  y = Math.max(BOX_MIN_Y, y);
  for (let i = 0; i < 1000; i++) {
    if (x + w > BOX_MAX_RIGHT) {
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
export function endOfLane(boxes, { w, h }) {
  if (!boxes.length) return { x: BOX_MIN_X, y: BOX_MIN_Y };
  const lastRow = Math.max(...boxes.map((b) => b.y));
  return findSlot(boxes, { x: BOX_MIN_X, y: lastRow, w, h });
}
