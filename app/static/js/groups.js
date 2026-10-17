// Groups: a bracket or outline drawn around related boxes (e.g. effects that
// apply while a buff is active). The outline is computed from the member
// boxes every time it's drawn, so it follows them when they move.
// Pure functions, no DOM.

export const GROUP_STYLES = [
  { id: "bracket", name: "Bracket" }, // open on the left, as in the Meren mock-up
  { id: "outline", name: "Outline" }, // closed rounded rectangle
];
const STYLE_IDS = new Set(GROUP_STYLES.map((s) => s.id));

export const GROUP_PAD = 12;
const RADIUS = 14;

function newId(items) {
  let max = 0;
  for (const g of items) {
    const m = /^g(\d+)$/.exec(g.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `g${max + 1}`;
}

// Valid groups whose boxes exist; groups left with no boxes are dropped.
export function normalizeGroups(groups, boxIds) {
  const ids = new Set(boxIds);
  return (Array.isArray(groups) ? groups : [])
    .filter((g) => g && typeof g.id === "string")
    .map((g) => ({
      id: g.id,
      boxes: [...new Set((Array.isArray(g.boxes) ? g.boxes : []).filter((b) => ids.has(b)))],
      label: typeof g.label === "string" ? g.label : "",
      style: STYLE_IDS.has(g.style) ? g.style : "bracket",
    }))
    .filter((g) => g.boxes.length);
}

const groups = (chart) => (chart.groups ||= []);

export function getGroup(chart, id) {
  return groups(chart).find((g) => g.id === id) || null;
}

// Returns the new group, or null when no listed box exists.
export function addGroup(chart, boxIds, { label = "", style = "bracket" } = {}) {
  const exists = new Set(chart.boxes.map((b) => b.id));
  const members = [...new Set(boxIds)].filter((id) => exists.has(id));
  if (!members.length) return null;
  const group = { id: newId(groups(chart)), boxes: members, label, style: STYLE_IDS.has(style) ? style : "bracket" };
  groups(chart).push(group);
  return group;
}

export function updateGroup(chart, id, patch) {
  const group = getGroup(chart, id);
  if (!group) return null;
  if ("label" in patch) group.label = String(patch.label ?? "").trim();
  if ("style" in patch && STYLE_IDS.has(patch.style)) group.style = patch.style;
  return group;
}

export function deleteGroup(chart, id) {
  chart.groups = groups(chart).filter((g) => g.id !== id);
}

// Add a box to the group, or take it out. A group whose last box is taken out
// is deleted. Returns whether the box is now a member.
export function toggleMember(chart, id, boxId) {
  const group = getGroup(chart, id);
  if (!group || !chart.boxes.some((b) => b.id === boxId)) return false;
  if (group.boxes.includes(boxId)) {
    group.boxes = group.boxes.filter((b) => b !== boxId);
    if (!group.boxes.length) deleteGroup(chart, id);
    return false;
  }
  group.boxes.push(boxId);
  return true;
}

// Called when a box is deleted.
export function forgetBox(chart, boxId) {
  for (const g of groups(chart)) g.boxes = g.boxes.filter((b) => b !== boxId);
  chart.groups = groups(chart).filter((g) => g.boxes.length);
}

// The rectangle around a group's boxes (absolute positions), padded.
export function groupRect(group, boxes, pad = GROUP_PAD) {
  const members = boxes.filter((b) => group.boxes.includes(b.id));
  if (!members.length) return null;
  const x = Math.min(...members.map((b) => b.x)) - pad;
  const y = Math.min(...members.map((b) => b.y)) - pad;
  const right = Math.max(...members.map((b) => b.x + b.w)) + pad;
  const bottom = Math.max(...members.map((b) => b.y + b.h)) + pad;
  return { x, y, w: right - x, h: bottom - y };
}

// SVG path for the group's line: a bracket open on the left, or a closed
// outline. Both have rounded corners.
export function groupPathD(style, { x, y, w, h }) {
  const r = Math.min(RADIUS, w / 2, h / 2);
  const right = x + w, bottom = y + h;
  const rightSide = `H${right - r} A${r} ${r} 0 0 1 ${right} ${y + r} V${bottom - r} A${r} ${r} 0 0 1 ${right - r} ${bottom}`;
  if (style === "outline") {
    return `M${x + r} ${y} ${rightSide} H${x + r} A${r} ${r} 0 0 1 ${x} ${bottom - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }
  return `M${x} ${y} ${rightSide} H${x}`;
}
