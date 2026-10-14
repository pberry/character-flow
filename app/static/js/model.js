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
  { name: "Gray", value: "#e5e7eb" },
  { name: "White", value: "#ffffff" },
];

export const CATEGORY_COLORS = {
  weapon: "#fecaca",
  spell: "#bfdbfe",
  feature: "#bbf7d0",
  decision: "#fde68a",
  action: "#e5e7eb",
  terminal: "#ddd6fe",
};

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
  return { character, boxes: [], edges: [] };
}

// Fill in anything missing from older or hand-edited data.
export function normalizeChart(data) {
  const chart = { ...newChart(), ...(data || {}) };
  chart.character = { ...defaultCharacter(), ...(chart.character || {}) };
  for (const key of ["abilities", "weapons", "spells", "features"]) {
    if (!Array.isArray(chart.character[key])) chart.character[key] = [];
  }
  chart.boxes = Array.isArray(chart.boxes) ? chart.boxes : [];
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

export function addBox(chart, { x = 0, y = 0, w = BOX_W, h = BOX_H, text = "", color = COLORS[0].value } = {}) {
  const box = { id: nextId("b", chart.boxes), x: snap(x), y: snap(y), w, h, text, color };
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

export function moveBox(chart, id, x, y) {
  return updateBox(chart, id, { x: snap(x), y: snap(y) });
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
        { label: "Start of turn", text: "Start of turn", color: CATEGORY_COLORS.terminal },
        { label: "Decision?", text: "?", color: CATEGORY_COLORS.decision },
        { label: "Action", text: "", color: CATEGORY_COLORS.action },
        { label: "End turn", text: "End turn", color: CATEGORY_COLORS.terminal },
      ],
    },
    { title: "Weapons", items: fromList(character.weapons, "weapon") },
    { title: "Spells", items: fromList(character.spells, "spell") },
    { title: "Features", items: fromList(character.features, "feature") },
  ].filter((g) => g.items.length);
}
