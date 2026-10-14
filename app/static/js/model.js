import { BOX_MIN_X, BOX_MIN_Y } from "./layout.js";

// Pure chart-state operations. Functions mutate the chart passed in and return
// what they created, so the editor can keep a single mutable state object.

export const COLORS = [
  { name: "Yellow", value: "#fde68a" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Red", value: "#fecaca" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Purple", value: "#ddd6fe" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Teal", value: "#99f6e4" },
  { name: "Indigo", value: "#a5b4fc" },
  { name: "Gray", value: "#e5e7eb" },
  { name: "White", value: "#ffffff" },
];

export const CATEGORY_COLORS = {
  weapon: "#fecaca",
  spell: "#bfdbfe",
  feature: "#bbf7d0",
  decision: "#fde68a",
  action: "#e5e7eb",
};

const DEFAULT_LANES = [
  { name: "Start of turn", color: "#bbf7d0" },
  { name: "Attack", color: "#fecaca" },
  { name: "Bonus Actions", color: "#bfdbfe" },
  { name: "Reactions", color: "#fde68a" },
  { name: "Other Actions", color: "#99f6e4" },
];
const NEW_LANE = { name: "New lane", color: "#e5e7eb" };

export function defaultLanes() {
  return DEFAULT_LANES.map((lane, i) => ({ id: `l${i + 1}`, ...lane }));
}

export const BOX_W = 160;
export const BOX_H = 70;
export const GRID = 10;

export function defaultCharacter() {
  return {
    name: "",
    class: "",
    level: 1,
    abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((name) => ({ name, score: 10 })),
    weapons: [],
    spells: [],
    features: [],
    notes: "",
  };
}

export function newChart(character = defaultCharacter()) {
  return { version: 2, character, lanes: defaultLanes(), boxes: [], edges: [] };
}

// Fill in anything missing from older or hand-edited data.
export function normalizeChart(data) {
  const chart = { ...newChart(), ...(data || {}) };
  chart.character = { ...defaultCharacter(), ...(chart.character || {}) };
  for (const key of ["abilities", "weapons", "spells", "features"]) {
    if (!Array.isArray(chart.character[key])) chart.character[key] = [];
  }
  if (!Array.isArray(chart.lanes) || !chart.lanes.length) chart.lanes = defaultLanes();
  const laneIds = new Set(chart.lanes.map((l) => l.id));
  chart.boxes = (Array.isArray(chart.boxes) ? chart.boxes : []).map((b) =>
    laneIds.has(b.lane) ? b : { ...b, lane: chart.lanes[0].id },
  );
  const ids = new Set(chart.boxes.map((b) => b.id));
  chart.edges = (Array.isArray(chart.edges) ? chart.edges : []).filter(
    (e) => e && e.from && e.to && ids.has(e.from.box) && ids.has(e.to.box),
  );
  return chart;
}

export function abilityModifier(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}

export function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function snap(n, grid = GRID) {
  return Math.round(n / grid) * grid;
}

export function nextId(prefix, items) {
  let max = 0;
  for (const item of items) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(item.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

const clampX = (x) => Math.max(BOX_MIN_X, snap(x));
const clampY = (y) => Math.max(BOX_MIN_Y, snap(y));

// `y` is relative to the top of `lane`.
export function addBox(chart, { lane = chart.lanes[0]?.id, x = BOX_MIN_X, y = BOX_MIN_Y, w = BOX_W, h = BOX_H, text = "", color = COLORS[0].value } = {}) {
  const box = { id: nextId("b", chart.boxes), lane, x: clampX(x), y: clampY(y), w, h, text, color };
  chart.boxes.push(box);
  return box;
}

export function getBox(chart, id) {
  return chart.boxes.find((b) => b.id === id) || null;
}

export function updateBox(chart, id, patch) {
  const box = getBox(chart, id);
  if (box) Object.assign(box, patch);
  return box;
}

export function moveBox(chart, id, lane, x, y) {
  return updateBox(chart, id, { lane, x: clampX(x), y: clampY(y) });
}

export const MIN_W = 60;
export const MIN_H = 30;

export function resizeBox(chart, id, w, h) {
  return updateBox(chart, id, { w: Math.max(MIN_W, snap(w)), h: Math.max(MIN_H, snap(h)) });
}

export function deleteBox(chart, id) {
  chart.boxes = chart.boxes.filter((b) => b.id !== id);
  chart.edges = chart.edges.filter((e) => e.from.box !== id && e.to.box !== id);
}

export function bringToFront(chart, id) {
  const i = chart.boxes.findIndex((b) => b.id === id);
  if (i >= 0 && i < chart.boxes.length - 1) chart.boxes.push(...chart.boxes.splice(i, 1));
}

// Returns the new edge, or null for self-loops and exact duplicates.
export function addEdge(chart, from, to, label = "") {
  if (from.box === to.box) return null;
  if (!getBox(chart, from.box) || !getBox(chart, to.box)) return null;
  const dup = chart.edges.some(
    (e) => e.from.box === from.box && e.from.side === from.side && e.to.box === to.box && e.to.side === to.side,
  );
  if (dup) return null;
  const edge = { id: nextId("e", chart.edges), from: { ...from }, to: { ...to }, label };
  chart.edges.push(edge);
  return edge;
}

export function updateEdge(chart, id, patch) {
  const edge = chart.edges.find((e) => e.id === id);
  if (edge) Object.assign(edge, patch);
  return edge || null;
}

export function deleteEdge(chart, id) {
  chart.edges = chart.edges.filter((e) => e.id !== id);
}

// ---- lanes ----------------------------------------------------------------

export function getLane(chart, id) {
  return chart.lanes.find((l) => l.id === id) || null;
}

export function addLane(chart, afterId = null, { name = NEW_LANE.name, color = NEW_LANE.color } = {}) {
  const lane = { id: nextId("l", chart.lanes), name, color };
  const i = chart.lanes.findIndex((l) => l.id === afterId);
  chart.lanes.splice(i < 0 ? chart.lanes.length : i + 1, 0, lane);
  return lane;
}

export function updateLane(chart, id, patch) {
  const lane = getLane(chart, id);
  if (lane) Object.assign(lane, patch);
  return lane;
}

// Move a lane up (-1) or down (+1). Returns whether it moved.
export function moveLane(chart, id, delta) {
  const i = chart.lanes.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= chart.lanes.length) return false;
  [chart.lanes[i], chart.lanes[j]] = [chart.lanes[j], chart.lanes[i]];
  return true;
}

export function boxesInLane(chart, id) {
  return chart.boxes.filter((b) => b.lane === id);
}

// Deletes the lane with its boxes and their arrows. The last lane can't be deleted.
export function deleteLane(chart, id) {
  if (chart.lanes.length <= 1 || !getLane(chart, id)) return false;
  for (const box of boxesInLane(chart, id)) deleteBox(chart, box.id);
  chart.lanes = chart.lanes.filter((l) => l.id !== id);
  return true;
}

const cardText = (item) => (item.notes ? `${item.name}\n${item.notes}` : item.name);

// Sidebar palette groups derived from the questionnaire answers.
export function paletteGroups(character) {
  const fromList = (items, category) =>
    (items || [])
      .filter((i) => i && i.name && i.name.trim())
      .map((i) => ({ label: i.name, text: cardText(i), color: CATEGORY_COLORS[category] }));
  return [
    {
      title: "Flow",
      items: [
        { label: "Decision?", text: "?", color: CATEGORY_COLORS.decision },
        // No color: takes the color of the lane it lands in.
        { label: "Blank box", text: "", color: null },
      ],
    },
    { title: "Weapons", items: fromList(character.weapons, "weapon") },
    { title: "Spells", items: fromList(character.spells, "spell") },
    { title: "Features", items: fromList(character.features, "feature") },
  ].filter((g) => g.items.length);
}
