// The tracker side column: sections of items (gear, resources, healing,
// conditions) stacked automatically left of the lanes. An item has text, an
// optional count printed as tick circles to mark in pencil, badges, and an
// optional color (white when unset).
// Pure functions, no DOM. `chart.sidebar` is null when there's no column.

import { badgeOverhang, normalizeBadges } from "./badges.js";
import { isColor } from "./colors.js";

export const SIDE_W = 200;   // the lanes give up this much width to the column
export const MAX_COUNT = 20;
const DEFAULT_SECTIONS = ["Gear", "Resources", "Healing", "Conditions"];

export const sideWidth = (chart) => (chart.sidebar ? SIDE_W : 0);

function newId(prefix, items) {
  let max = 0;
  for (const item of items) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(item.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

const clampCount = (n) => Math.max(0, Math.min(MAX_COUNT, Math.floor(Number(n)) || 0));

// Fill in or drop anything malformed. Returns null for no column.
export function normalizeSidebar(data) {
  if (!data || typeof data !== "object") return null;
  const sections = (Array.isArray(data.sections) ? data.sections : []).filter((s) => s && typeof s.id === "string");
  return {
    sections: sections.map((s) => ({
      id: s.id,
      name: typeof s.name === "string" && s.name.trim() ? s.name : "Section",
      items: (Array.isArray(s.items) ? s.items : [])
        .filter((i) => i && typeof i.id === "string")
        .map((i) => ({
          id: i.id,
          text: typeof i.text === "string" ? i.text : "",
          count: clampCount(i.count),
          badges: normalizeBadges(i.badges),
          ...(isColor(i.color) ? { color: i.color } : {}),
        })),
    })),
  };
}

// ---- column ----------------------------------------------------------------

export function enableSidebar(chart) {
  if (!chart.sidebar) {
    chart.sidebar = { sections: DEFAULT_SECTIONS.map((name, i) => ({ id: `s${i + 1}`, name, items: [] })) };
  }
  return chart.sidebar;
}

export function disableSidebar(chart) {
  chart.sidebar = null;
}

// ---- sections --------------------------------------------------------------

const sections = (chart) => chart.sidebar?.sections || [];

export function getSection(chart, id) {
  return sections(chart).find((s) => s.id === id) || null;
}

export function addSection(chart, afterId = null, name = "New section") {
  if (!chart.sidebar) return null;
  const list = chart.sidebar.sections;
  const section = { id: newId("s", list), name, items: [] };
  const i = list.findIndex((s) => s.id === afterId);
  list.splice(i < 0 ? list.length : i + 1, 0, section);
  return section;
}

export function renameSection(chart, id, name) {
  const section = getSection(chart, id);
  const clean = (name || "").trim();
  if (section && clean) section.name = clean;
  return section;
}

function moveIn(list, i, delta) {
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  return true;
}

// Move up (-1) or down (+1). Returns whether it moved.
export function moveSection(chart, id, delta) {
  const list = sections(chart);
  return moveIn(list, list.findIndex((s) => s.id === id), delta);
}

export function deleteSection(chart, id) {
  if (!chart.sidebar) return;
  chart.sidebar.sections = chart.sidebar.sections.filter((s) => s.id !== id);
}

// ---- items -----------------------------------------------------------------

export const allItems = (chart) => sections(chart).flatMap((s) => s.items);

export function findItem(chart, id) {
  for (const section of sections(chart)) {
    const index = section.items.findIndex((i) => i.id === id);
    if (index >= 0) return { section, item: section.items[index], index };
  }
  return null;
}

export const getItem = (chart, id) => findItem(chart, id)?.item || null;

// Adds after `afterId` in its section, or at the end of section `sectionId`.
export function addItem(chart, { sectionId = null, afterId = null, text = "" } = {}) {
  const after = afterId && findItem(chart, afterId);
  const section = after ? after.section : getSection(chart, sectionId);
  if (!section) return null;
  const item = { id: newId("t", allItems(chart)), text, count: 0, badges: [] };
  section.items.splice(after ? after.index + 1 : section.items.length, 0, item);
  return item;
}

export function updateItem(chart, id, patch) {
  const item = getItem(chart, id);
  if (!item) return null;
  if ("text" in patch) item.text = String(patch.text ?? "");
  if ("count" in patch) item.count = clampCount(patch.count);
  if ("color" in patch) {
    if (isColor(patch.color)) item.color = patch.color;
    else delete item.color;
  }
  return item;
}

// Move within its section, up (-1) or down (+1). Returns whether it moved.
export function moveItem(chart, id, delta) {
  const found = findItem(chart, id);
  return !!found && moveIn(found.section.items, found.index, delta);
}

export function deleteItem(chart, id) {
  const found = findItem(chart, id);
  if (found) found.section.items.splice(found.index, 1);
}

// ---- layout ----------------------------------------------------------------

// Items leave room on the right for badges sticking out of their corners.
export const ITEM_X = 10;
export const ITEM_W = 160;
const TOP = 8;
const HEAD_H = 24;
const LINE_H = 16;
const PAD_Y = 5;
const ITEM_GAP = 6;
const SECTION_GAP = 10;
const CHARS_PER_LINE = 19; // rough, slightly low fit for 13px text in an item
// Badges on items stack inward: there's no room outward in the column.
export const ITEM_BADGES = { inward: true };
export const TICK = 16;    // spacing of the tick circles
const TICKS_PER_ROW = Math.floor((ITEM_W - 16) / TICK);

// Rough wrapped line count (layout is pure, so text can't be measured).
export function estimateLines(text) {
  let lines = 0;
  for (const para of (text || "").split("\n")) {
    let line = 0;
    let n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const len = [...word].length;
      if (line && line + 1 + len > CHARS_PER_LINE) {
        n += 1;
        line = len;
      } else {
        line += (line ? 1 : 0) + len;
      }
      while (line > CHARS_PER_LINE) {
        n += 1;
        line -= CHARS_PER_LINE;
      }
    }
    lines += n;
  }
  return Math.max(1, lines);
}

// Tick-circle centers, relative to the item, below its text.
export function tickPositions(count, textBottom) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / TICKS_PER_ROW), col = i % TICKS_PER_ROW;
    out.push({ x: 8 + TICK / 2 + col * TICK, y: textBottom + TICK / 2 + row * TICK });
  }
  return out;
}

// Absolute positions for the column whose left edge is at `left`.
export function layoutSidebar(sidebar, left) {
  const out = { x: left, w: SIDE_W, sections: [], items: [], height: 0 };
  if (!sidebar) return out;
  let y = TOP;
  for (const section of sidebar.sections) {
    out.sections.push({ id: section.id, name: section.name, x: left + ITEM_X, y, w: ITEM_W, h: HEAD_H });
    y += HEAD_H;
    for (const item of section.items) {
      const textH = estimateLines(item.text) * LINE_H + 2 * PAD_Y;
      const rows = Math.ceil(item.count / TICKS_PER_ROW);
      const h = textH + (rows ? rows * TICK + 6 : 0);
      const local = { w: ITEM_W, h, shape: "rect", badges: item.badges };
      const over = badgeOverhang(local, ITEM_BADGES);
      y += over.top;
      out.items.push({
        ...item, sectionId: section.id, x: left + ITEM_X, y, w: ITEM_W, h, shape: "rect", textH,
        ticks: tickPositions(item.count, textH - 2),
      });
      y += h + Math.max(ITEM_GAP, over.bottom + 4);
    }
    y += SECTION_GAP;
  }
  out.height = y;
  return out;
}
