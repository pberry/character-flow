// Pure geometry helpers: anchors, edge routing, hit-testing, suggestions, print fitting.
// No DOM access here so everything can be unit tested with `node --test`.

export const SIDES = ["top", "right", "bottom", "left"];
const DIRS = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const STUB = 18;

// Midpoint of a side: the only place arrows may attach.
export function anchor(box, side) {
  switch (side) {
    case "top": return { x: box.x + box.w / 2, y: box.y };
    case "right": return { x: box.x + box.w, y: box.y + box.h / 2 };
    case "bottom": return { x: box.x + box.w / 2, y: box.y + box.h };
    case "left": return { x: box.x, y: box.y + box.h / 2 };
    default: throw new Error(`unknown side ${side}`);
  }
}

export function center(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function nearestSide(box, point) {
  let best = null;
  let bestDist = Infinity;
  for (const side of SIDES) {
    const a = anchor(box, side);
    const d = (a.x - point.x) ** 2 + (a.y - point.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = side;
    }
  }
  return best;
}

export function boxAt(boxes, point) {
  // Topmost (last drawn) box wins.
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return b;
  }
  return null;
}

const isHorizontal = (side) => side === "left" || side === "right";

// Orthogonal (elbow) route between two anchors, as a list of points.
export function routePoints(p1, side1, p2, side2) {
  const d1 = DIRS[side1];
  const d2 = DIRS[side2];
  const s = { x: p1.x + d1.x * STUB, y: p1.y + d1.y * STUB };
  const e = { x: p2.x + d2.x * STUB, y: p2.y + d2.y * STUB };
  let middle;
  if (isHorizontal(side1) && isHorizontal(side2)) {
    const midX = (s.x + e.x) / 2;
    middle = [{ x: midX, y: s.y }, { x: midX, y: e.y }];
  } else if (!isHorizontal(side1) && !isHorizontal(side2)) {
    const midY = (s.y + e.y) / 2;
    middle = [{ x: s.x, y: midY }, { x: e.x, y: midY }];
  } else if (isHorizontal(side1)) {
    middle = [{ x: e.x, y: s.y }];
  } else {
    middle = [{ x: s.x, y: e.y }];
  }
  return simplify([p1, s, ...middle, e, p2]);
}

// Drop duplicate and collinear interior points.
export function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

export function pathD(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${round(p.x)} ${round(p.y)}`).join(" ");
}

const round = (n) => Math.round(n * 10) / 10;

// Point halfway along a polyline, for placing edge labels.
export function polylineMidpoint(points) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segs.push(len);
    total += len;
  }
  let remaining = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (remaining <= segs[i] && segs[i] > 0) {
      const t = remaining / segs[i];
      const a = points[i], b = points[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= segs[i];
  }
  return points[0];
}

export function edgePoints(boxes, edge) {
  const from = boxes.find((b) => b.id === edge.from.box);
  const to = boxes.find((b) => b.id === edge.to.box);
  if (!from || !to) return null;
  return routePoints(anchor(from, edge.from.side), edge.from.side, anchor(to, edge.to.side), edge.to.side);
}

function connected(edges, a, b) {
  return edges.some(
    (e) => (e.from.box === a && e.to.box === b) || (e.from.box === b && e.to.box === a),
  );
}

// Suggest likely arrows for the selected box. The chart flows left to right, so
// boxes to the right get an outgoing arrow, boxes to the left an incoming one,
// and boxes stacked directly above/below (branch stacks) a vertical arrow.
export function suggestEdges(boxes, edges, selectedId, { max = 3, maxScore = 700 } = {}) {
  const sel = boxes.find((b) => b.id === selectedId);
  if (!sel) return [];
  const sc = center(sel);
  const candidates = [];
  for (const b of boxes) {
    if (b.id === sel.id || connected(edges, sel.id, b.id)) continue;
    const bc = center(b);
    const rightGap = b.x - (sel.x + sel.w);
    const leftGap = sel.x - (b.x + b.w);
    const downGap = b.y - (sel.y + sel.h);
    const upGap = sel.y - (b.y + b.h);
    const overlapsX = b.x < sel.x + sel.w && b.x + b.w > sel.x;
    if (rightGap >= 0) {
      candidates.push({
        score: rightGap + 2 * Math.abs(bc.y - sc.y),
        from: { box: sel.id, side: "right" },
        to: { box: b.id, side: "left" },
      });
    } else if (leftGap >= 0) {
      candidates.push({
        score: leftGap + 2 * Math.abs(bc.y - sc.y) + 40, // outgoing preferred
        from: { box: b.id, side: "right" },
        to: { box: sel.id, side: "left" },
      });
    } else if (overlapsX && downGap >= 0) {
      candidates.push({
        score: downGap + 2 * Math.abs(bc.x - sc.x),
        from: { box: sel.id, side: "bottom" },
        to: { box: b.id, side: "top" },
      });
    } else if (overlapsX && upGap >= 0) {
      candidates.push({
        score: upGap + 2 * Math.abs(bc.x - sc.x) + 40,
        from: { box: b.id, side: "bottom" },
        to: { box: sel.id, side: "top" },
      });
    }
  }
  return candidates
    .filter((c) => c.score <= maxScore)
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map(({ from, to }) => ({ from, to }));
}

export function boundingBox(boxes) {
  if (!boxes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// viewBox that contains the chart, matches the page aspect ratio, and never
// zooms in past `minWidth` world units (so a tiny chart isn't blown up).
export function fitViewBox(bbox, aspect, { padding = 30, minWidth = 900 } = {}) {
  if (!bbox) return { x: 0, y: 0, w: minWidth, h: minWidth / aspect };
  let w = Math.max(bbox.w + padding * 2, minWidth);
  let h = bbox.h + padding * 2;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  return { x: bbox.x - padding, y: bbox.y - padding, w, h };
}
