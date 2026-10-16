// Badges: small labels on a box's corners for cost, duration, recharge, or a
// modifier. Each type has its own shape so they read apart even in black and
// white. Text is free; the type only picks the shape, color, and corner.
// Pure functions in box-local coordinates, no DOM.

import { nearestOutlinePoint } from "./shapes.js";

// `corner` is [dx, dy]: which bounding-box corner the badge sits on. Corners
// keep badges clear of the side midpoints where arrows attach.
export const BADGE_TYPES = [
  { id: "cost", name: "Cost", example: "1 FP", corner: [1, -1], fill: "#c7d2fe", stroke: "#dc2626" },
  { id: "duration", name: "Duration", example: "10 min", corner: [-1, -1], fill: "#86efac", stroke: "#3f3f46" },
  { id: "recharge", name: "Recharge", example: "LR", corner: [1, 1], fill: "#f9a8d4", stroke: "#3f3f46" },
  { id: "modifier", name: "Modifier", example: "2x", corner: [-1, 1], fill: "#a5b4fc", stroke: "#3f3f46" },
];

const BY_ID = new Map(BADGE_TYPES.map((t) => [t.id, t]));
export const badgeType = (id) => BY_ID.get(id) || null;

// ---- badge lists ----------------------------------------------------------
// These work on anything with a `badges` array: boxes and tracker items.

// Valid badges only, with trimmed text.
export function normalizeBadges(list) {
  return (Array.isArray(list) ? list : [])
    .filter((g) => g && badgeType(g.type) && typeof g.text === "string" && g.text.trim())
    .map((g) => ({ type: g.type, text: g.text.trim() }));
}

// Returns the new badge, or null for an unknown type or empty text.
export function addBadge(target, type, text) {
  const clean = (text || "").trim();
  if (!target || !badgeType(type) || !clean) return null;
  target.badges = target.badges || [];
  const badge = { type, text: clean };
  target.badges.push(badge);
  return badge;
}

// Empty text removes the badge.
export function updateBadge(target, index, text) {
  const badge = target?.badges?.[index];
  if (!badge) return null;
  const clean = (text || "").trim();
  if (!clean) {
    removeBadge(target, index);
    return null;
  }
  badge.text = clean;
  return badge;
}

export function removeBadge(target, index) {
  if (target?.badges?.[index]) target.badges.splice(index, 1);
}

export const BADGE_FONT = 12;
export const LINE_H = 13;
const CHAR_W = 7;     // rough width of one character at BADGE_FONT
const LINE_CHARS = 8; // longer text wraps at spaces to keep badges small
const GAP = 4;        // between badges stacked on the same corner

const chars = (text) => [...text].length;

// Greedy word wrap. A single long word stays on its own line.
export function wrapText(text, max = LINE_CHARS) {
  const lines = [];
  for (const word of (text || "").trim().split(/\s+/).filter(Boolean)) {
    const last = lines.length - 1;
    if (last >= 0 && chars(lines[last]) + 1 + chars(word) <= max) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines.length ? lines : [""];
}

// Badge size for its text, plus the wrapped lines and where their block is
// centered vertically (relative to the badge center).
export function badgeSize(type, text) {
  const lines = wrapText(text);
  const tw = Math.max(...lines.map(chars)) * CHAR_W;
  const bh = lines.length * LINE_H;
  const out = (w, h, textY = 0) => ({ w: Math.ceil(w), h: Math.ceil(h), lines, textY });
  switch (type) {
    case "cost": {
      const d = Math.max(30, Math.hypot(tw, bh) + 6);
      return out(d, d);
    }
    case "duration": {
      const h = Math.max(24, bh + 10);
      return out(Math.max(44, tw + h), h);
    }
    case "recharge": {
      // The text sits in the plus's center square, whose side is 56% of the badge.
      const s = Math.max(34, (Math.max(tw, bh) + 6) / 0.56);
      return out(s, s);
    }
    case "modifier": {
      // The text block sits at the bottom of the triangle; its top line must
      // fit the triangle's width at that height.
      const w = Math.max(36, tw + 6 + (4 + bh) / 0.87);
      const h = w * 0.87;
      return out(w, h, Math.ceil(h) / 2 - 4 - bh / 2);
    }
    default:
      return out(30, 30);
  }
}

// Outline centered on (0, 0).
export function badgePathD(type, w, h) {
  const x = w / 2, y = h / 2;
  switch (type) {
    case "cost":
      return `M${-x} 0 A${x} ${y} 0 1 0 ${x} 0 A${x} ${y} 0 1 0 ${-x} 0 Z`;
    case "duration":
      return `M${-x + y} ${-y} H${x - y} A${y} ${y} 0 0 1 ${x - y} ${y} H${-x + y} A${y} ${y} 0 0 1 ${-x + y} ${-y} Z`;
    case "recharge": {
      const a = 0.28 * w, b = 0.28 * h; // half the arm thickness
      return `M${-a} ${-y} H${a} V${-b} H${x} V${b} H${a} V${y} H${-a} V${b} H${-x} V${-b} H${-a} Z`;
    }
    case "modifier":
      return `M0 ${-y} L${x} ${y} L${-x} ${y} Z`;
    default:
      return `M${-x} ${-y} H${x} V${y} H${-x} Z`;
  }
}

// Where each of a box's badges goes. A badge sits on the point of the outline
// nearest its type's corner (a star's arm or leg tip, the middle of a diamond's
// edge); more of the same type line up outward from it, or inward along the
// edge when `inward` is set (for tight spots like the tracker column).
export function layoutBadges(box, { inward = false } = {}) {
  const out = [];
  const last = new Map(); // type -> the previous badge placed on that corner
  for (const [index, badge] of (box.badges || []).entries()) {
    const type = badgeType(badge.type);
    if (!type) continue;
    const size = badgeSize(badge.type, badge.text);
    const [dx, dy] = type.corner;
    const prev = last.get(badge.type);
    const corner = nearestOutlinePoint(box.shape, box.w, box.h, dx > 0 ? box.w : 0, dy > 0 ? box.h : 0);
    const step = (inward ? -dx : dx) * (prev ? prev.w / 2 + GAP + size.w / 2 : 0);
    const x = prev ? prev.x + step : corner.x;
    const placed = { index, type: badge.type, text: badge.text, x, y: corner.y, ...size };
    last.set(badge.type, placed);
    out.push(placed);
  }
  return out;
}

// How far a box's badges stick out past its edges (0 where they don't).
export function badgeOverhang(box, opts) {
  let top = 0, right = 0, bottom = 0;
  for (const b of layoutBadges(box, opts)) {
    top = Math.max(top, b.h / 2 - b.y);
    right = Math.max(right, b.x + b.w / 2 - box.w);
    bottom = Math.max(bottom, b.y + b.h / 2 - box.h);
  }
  return { top, right, bottom };
}
