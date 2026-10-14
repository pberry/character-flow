// Swim-lane layout. Lanes stack top to bottom and grow to fit their boxes.
// Boxes store `y` relative to their lane's top, so a lane growing never
// requires rewriting the boxes below it. Pure functions, no DOM.

export const HEADER_W = 150;     // lane header column, drawn left of x = 0
export const LANE_PAD = 20;      // space below the lowest box in a lane
export const MIN_LANE_H = 110;
export const MIN_CONTENT_W = 900;
export const BOX_MIN_X = 20;     // boxes stay right of the header column
export const BOX_MIN_Y = 10;     // ...and below their lane's top edge

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

  const right = boxes.reduce((m, b) => Math.max(m, b.x + b.w), 0);
  const last = lanes[lanes.length - 1];
  return {
    lanes,
    boxes,
    left: -HEADER_W,
    width: HEADER_W + Math.max(MIN_CONTENT_W, right + 60),
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
