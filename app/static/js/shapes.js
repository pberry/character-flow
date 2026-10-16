// Box shapes: outlines, text areas, and where arrows meet the outline.
// Pure functions in box-local coordinates (0,0 is the box's top-left), no DOM.
// Shapes only tell boxes apart; the app never gives them a fixed meaning.

export const SHAPES = [
  { id: "rect", name: "Rectangle" },
  { id: "flag", name: "Flag" },
  { id: "diamond", name: "Diamond" },
  { id: "star", name: "Star" },
  { id: "document", name: "Document" },
  { id: "arrow-right", name: "Right arrow" },
  { id: "arrow-up", name: "Up arrow" },
];

const IDS = new Set(SHAPES.map((s) => s.id));
export const isShape = (id) => IDS.has(id);

// Smallest size each shape reads well at. Switching to a shape grows a box to
// at least this size; it never shrinks one.
const MIN_SIZE = {
  diamond: { w: 160, h: 90 },
  star: { w: 160, h: 140 },
  "arrow-right": { w: 180, h: 80 },
  "arrow-up": { w: 140, h: 130 },
};
export const minSize = (shape) => MIN_SIZE[shape] || null;

const WAVE_STEPS = 24;
const waveAmp = (h) => Math.min(0.1 * h, 10);

// One wave period across the width, from x = 0 to x = w.
function wave(w, baseY, amp, phase = 1) {
  const pts = [];
  for (let i = 0; i <= WAVE_STEPS; i++) {
    const t = i / WAVE_STEPS;
    pts.push({ x: t * w, y: baseY + phase * amp * Math.sin(2 * Math.PI * t) });
  }
  return pts;
}

// Five-pointed star stretched to fill the box.
function star(w, h) {
  const raw = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.5 : 1;
    const a = (-90 + 36 * i) * (Math.PI / 180);
    raw.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  const xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return raw.map((p) => ({
    x: ((p.x - minX) / (maxX - minX)) * w,
    y: ((p.y - minY) / (maxY - minY)) * h,
  }));
}

// Outline as a closed polygon (curves are sampled), or null for the plain
// rectangle, which is drawn as a rounded <rect>.
export function shapePoints(shape, w, h) {
  const a = waveAmp(h);
  switch (shape) {
    case "flag": {
      // Waving banner: parallel wavy top and bottom, straight sides.
      const top = wave(w, a, a, -1);
      const bottom = wave(w, h - a, a, -1).reverse();
      return [...top, ...bottom];
    }
    case "document": {
      // Straight top and sides, wavy bottom (low on the left, high on the right).
      const bottom = wave(w, h - a, a).reverse();
      return [{ x: 0, y: 0 }, { x: w, y: 0 }, ...bottom];
    }
    case "diamond":
      return [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }];
    case "star":
      return star(w, h);
    case "arrow-right": {
      const hx = w - Math.min(0.3 * w, 0.6 * h);
      return [
        { x: 0, y: 0.2 * h }, { x: hx, y: 0.2 * h }, { x: hx, y: 0 }, { x: w, y: h / 2 },
        { x: hx, y: h }, { x: hx, y: 0.8 * h }, { x: 0, y: 0.8 * h },
      ];
    }
    case "arrow-up": {
      const hy = Math.min(0.35 * h, 0.6 * w);
      return [
        { x: w / 2, y: 0 }, { x: w, y: hy }, { x: 0.8 * w, y: hy }, { x: 0.8 * w, y: h },
        { x: 0.2 * w, y: h }, { x: 0.2 * w, y: hy }, { x: 0, y: hy },
      ];
    }
    default:
      return null;
  }
}

const r1 = (n) => Math.round(n * 10) / 10;

export function shapePathD(shape, w, h) {
  const pts = shapePoints(shape, w, h);
  if (!pts) return null;
  return `${pts.map((p, i) => `${i ? "L" : "M"}${r1(p.x)} ${r1(p.y)}`).join(" ")} Z`;
}

// Area the box text is laid out in.
export function textArea(shape, w, h) {
  const a = waveAmp(h);
  switch (shape) {
    case "flag": return { x: 0, y: 2 * a, w, h: h - 4 * a };
    case "document": return { x: 0, y: 0, w, h: h - 2 * a };
    case "diamond": return { x: 0.2 * w, y: 0.25 * h, w: 0.6 * w, h: 0.5 * h };
    // Wider than the star's body: text may run into the arms, as in the mock-up.
    case "star": return { x: 0.15 * w, y: 0.3 * h, w: 0.7 * w, h: 0.48 * h };
    case "arrow-right": {
      const hx = w - Math.min(0.3 * w, 0.6 * h);
      return { x: 0, y: 0.2 * h, w: hx + 0.15 * (w - hx), h: 0.6 * h };
    }
    case "arrow-up": {
      const hy = Math.min(0.35 * h, 0.6 * w);
      return { x: 0.2 * w, y: 0.6 * hy, w: 0.6 * w, h: h - 0.6 * hy };
    }
    default: return { x: 0, y: 0, w, h };
  }
}

const SIDE_DIR = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

// Where a ray from the box center toward the bounding-box point (dx, dy) leaves
// the outline. dx and dy are -1, 0, or 1: (1, 0) aims at the right side's
// midpoint and (1, -1) at the top-right corner. Uses the farthest crossing, so
// concave shapes like the star still work.
export function outlinePoint(shape, w, h, dx, dy) {
  const cx = w / 2, cy = h / 2;
  const rx = (dx * w) / 2, ry = (dy * h) / 2;
  const target = { x: cx + rx, y: cy + ry };
  const pts = shapePoints(shape, w, h);
  if (!pts) return target;
  let best = -1;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const ex = q.x - p.x, ey = q.y - p.y;
    const den = rx * ey - ry * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p.x - cx) * ey - (p.y - cy) * ex) / den; // along the ray
    const u = ((p.x - cx) * ry - (p.y - cy) * rx) / den; // along the edge
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best < 0 ? target : { x: cx + rx * best, y: cy + ry * best };
}

// Where arrows attach: a side's midpoint, moved onto the drawn outline.
export function outlineAnchor(shape, w, h, side) {
  const [dx, dy] = SIDE_DIR[side];
  return outlinePoint(shape, w, h, dx, dy);
}

// The point on the outline nearest (px, py), e.g. a bounding-box corner.
export function nearestOutlinePoint(shape, w, h, px, py) {
  const pts = shapePoints(shape, w, h);
  if (!pts) return { x: Math.min(w, Math.max(0, px)), y: Math.min(h, Math.max(0, py)) };
  let best = null, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const ex = q.x - p.x, ey = q.y - p.y;
    const len2 = ex * ex + ey * ey;
    const t = len2 ? Math.max(0, Math.min(1, ((px - p.x) * ex + (py - p.y) * ey) / len2)) : 0;
    const c = { x: p.x + t * ex, y: p.y + t * ey };
    const d = (c.x - px) ** 2 + (c.y - py) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
