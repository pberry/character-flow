// SVG swim-lane flowchart rendering and pointer interactions.

import { h, s } from "./dom.js";
import {
  SIDES, anchor, boxAt, edgePoints, nearestSide, pathD,
  polylineMidpoint, routePoints, suggestEdges,
} from "./geometry.js";
import { HEADER_W, PAGE_H, SLOT_GAP_X, boxMaxRight, endOfLane, findSlot, layoutBounds, layoutChart, laneAt } from "./layout.js";
import * as M from "./model.js";
import { BADGE_FONT, LINE_H, addBadge, badgePathD, badgeType, layoutBadges, removeBadge, updateBadge } from "./badges.js";
import { shapePathD, textArea } from "./shapes.js";
import * as T from "./sidebar.js";

const DOUBLE_CLICK_MS = 400;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const GRID_PX = 20;
const ADD_LANE_H = 36;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function arrowMarker(id, color) {
  return s(
    "marker",
    { id, viewBox: "0 0 10 10", refX: 10, refY: 5, markerWidth: 11, markerHeight: 11, markerUnits: "userSpaceOnUse", orient: "auto" },
    s("path", { d: "M0 0 L10 5 L0 10 z", fill: color }),
  );
}

// Each SVG gets its own marker ids so the editor and print copies don't collide.
export function createSvg(prefix) {
  return s(
    "svg",
    { class: "chart-svg" },
    s(
      "defs",
      {},
      arrowMarker(`${prefix}-arrow`, "#374151"),
      arrowMarker(`${prefix}-arrow-sel`, "#2563eb"),
      arrowMarker(`${prefix}-arrow-ghost`, "#9ca3af"),
    ),
  );
}

function boxText(text) {
  const [first, ...rest] = (text || "").split("\n");
  return h(
    "div",
    { class: "box-text" },
    h("div", { class: "box-inner" }, first ? h("strong", {}, first) : null, rest.length ? `\n${rest.join("\n")}` : null),
  );
}

function drawBadges(box, opts) {
  return layoutBadges(box, opts).map((b) => {
    const type = badgeType(b.type);
    return s(
      "g",
      { class: `badge badge-${b.type}`, "data-badge": b.index, transform: `translate(${b.x} ${b.y})` },
      s("title", {}, `${type.name}: ${b.text}`),
      s("path", { class: "badge-shape", d: badgePathD(b.type, b.w, b.h), fill: type.fill, stroke: type.stroke }),
      s("text", { class: "badge-text", "font-size": BADGE_FONT, "text-anchor": "middle", "dominant-baseline": "central" },
        b.lines.map((line, i) => s("tspan", { x: 0, y: b.textY + (i - (b.lines.length - 1) / 2) * LINE_H }, line))),
    );
  });
}

function drawLanes(layout, { selection, dropLane, interactive }) {
  const g = s("g", { class: "lanes" });
  const left = layout.lanesLeft;
  const right = layout.left + layout.width;
  layout.lanes.forEach((lane, i) => {
    const selected = selection?.type === "lane" && selection.id === lane.id;
    const lg = s("g", { class: `lane${selected ? " selected" : ""}${dropLane === lane.id ? " drop-target" : ""}` });
    lg.append(s("rect", { class: "lane-band", x: left, y: lane.top, width: right - left, height: lane.height }));
    const header = s("g", { class: "lane-header", "data-lane": lane.id });
    const hx = left + 10, hy = lane.top + 10, hw = HEADER_W - 30, hh = lane.height - 20;
    // Lane headers are flags: the start of each swim lane.
    const ta = textArea("flag", hw, hh);
    header.append(
      s("path", { class: "lane-header-rect", d: shapePathD("flag", hw, hh), transform: `translate(${hx} ${hy})`, fill: lane.color }),
      s("foreignObject", { x: hx + ta.x, y: hy + ta.y, width: ta.w, height: ta.h }, h("div", { class: "lane-name" }, lane.name)),
    );
    if (interactive) header.append(s("title", {}, "Click to edit this lane"));
    lg.append(header);
    if (i < layout.lanes.length - 1) {
      const y = lane.top + lane.height;
      lg.append(s("line", { class: "lane-divider", x1: left, y1: y, x2: right, y2: y }));
    }
    g.append(lg);
  });
  if (interactive) {
    // Page edges: boxes can't go past the right one; lanes reaching below the
    // bottom one make the printout shrink to fit. Badges may stick out past the
    // right edge, which widens the layout but not the page.
    const x = layout.contentW;
    g.append(s("line", { class: "page-edge", x1: x, y1: 0, x2: x, y2: Math.max(layout.height, PAGE_H) }));
    const over = layout.height > PAGE_H;
    g.append(
      s("line", { class: `page-bottom${over ? " over" : ""}`, x1: layout.left, y1: PAGE_H, x2: x, y2: PAGE_H }),
      s("text", { class: `page-bottom-label${over ? " over" : ""}`, x: x - 6, y: PAGE_H - 6, "text-anchor": "end" },
        over ? "Bottom of the printed page — the chart will print smaller" : "Bottom of the printed page"),
    );
    const y = layout.lanesHeight + 10;
    g.append(
      s(
        "g",
        { class: "add-lane", "data-add-lane": "1" },
        s("rect", { x: left + 10, y, width: HEADER_W - 30, height: ADD_LANE_H - 10, rx: 6 }),
        s("text", { x: left + 10 + (HEADER_W - 30) / 2, y: y + (ADD_LANE_H - 10) / 2, "text-anchor": "middle", "dominant-baseline": "central" }, "+ Add lane"),
      ),
    );
  }
  return g;
}

// The tracker side column: section headings over auto-stacked items.
function drawSidebar(layout, { selection, interactive }) {
  const side = layout.sidebar;
  const g = s("g", { class: "sidebar" });
  if (layout.left === layout.lanesLeft) return g; // no column
  const height = Math.max(layout.height, side.height);
  const isSel = (type, id) => selection?.type === type && selection.id === id;
  g.append(
    s("rect", { class: `side-band${isSel("sidebar", "sidebar") ? " selected" : ""}`, x: side.x, y: 0, width: side.w, height, "data-sidebar": "1" }),
    s("line", { class: "side-divider", x1: layout.lanesLeft, y1: 0, x2: layout.lanesLeft, y2: height }),
  );
  for (const sec of side.sections) {
    g.append(
      s(
        "g",
        { class: `tracker-section${isSel("section", sec.id) ? " selected" : ""}`, "data-section": sec.id },
        interactive ? s("title", {}, "Click to edit this section") : null,
        s("rect", { class: "section-hit", x: sec.x, y: sec.y, width: sec.w, height: sec.h }),
        s("text", { class: "section-name", x: sec.x + 2, y: sec.y + sec.h / 2 + 2, "dominant-baseline": "central" }, sec.name),
        s("line", { class: "section-rule", x1: sec.x, y1: sec.y + sec.h - 3, x2: sec.x + sec.w, y2: sec.y + sec.h - 3 }),
      ),
    );
  }
  for (const item of side.items) {
    const ig = s("g", {
      class: `tracker-item${isSel("item", item.id) ? " selected" : ""}`,
      "data-item": item.id,
      transform: `translate(${item.x} ${item.y})`,
    });
    ig.append(
      s("rect", { class: "item-rect", width: item.w, height: item.h, rx: 6 }),
      s("foreignObject", { x: 0, y: 0, width: item.w, height: item.textH }, boxText(item.text)),
      ...item.ticks.map((t) => s("circle", { class: "tick", cx: t.x, cy: t.y, r: 5.5 })),
      ...drawBadges(item, T.ITEM_BADGES),
    );
    g.append(ig);
  }
  return g;
}

// Draw the chart into group `g` using a precomputed layout (absolute boxes).
// Used both by the interactive canvas and print.
export function drawChart(g, chart, layout, opts = {}) {
  const { prefix = "c", selection = null, ghosts = [], connect = null, dropLane = null, interactive = false } = opts;
  const boxes = layout.boxes;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  g.replaceChildren();

  const edgesG = s("g", { class: "edges" });
  const labelsG = s("g", { class: "edge-labels" });
  for (const edge of chart.edges) {
    const pts = edgePoints(boxes, edge);
    if (!pts) continue;
    const selected = selection?.type === "edge" && selection.id === edge.id;
    const d = pathD(pts);
    const eg = s("g", { class: `edge${selected ? " selected" : ""}`, "data-edge": edge.id });
    if (interactive) eg.append(s("path", { class: "edge-hit", d }));
    eg.append(s("path", { class: "edge-line", d, "marker-end": `url(#${prefix}-arrow${selected ? "-sel" : ""})` }));
    if (edge.label) {
      const m = polylineMidpoint(pts);
      labelsG.append(s("text", { class: "edge-label", x: m.x, y: m.y, "text-anchor": "middle", "dominant-baseline": "central" }, edge.label));
    }
    edgesG.append(eg);
  }

  const boxesG = s("g", { class: "boxes" });
  for (const box of boxes) {
    const selected = selection?.type === "box" && selection.id === box.id;
    const target = connect?.target === box.id;
    const bg = s("g", {
      class: `box${selected ? " selected" : ""}${target ? " drop-target" : ""}`,
      "data-box": box.id,
      transform: `translate(${box.x} ${box.y})`,
    });
    const d = shapePathD(box.shape, box.w, box.h);
    bg.append(d
      ? s("path", { class: "box-rect", d, fill: box.color })
      : s("rect", { class: "box-rect", width: box.w, height: box.h, rx: 6, fill: box.color }));
    const ta = textArea(box.shape, box.w, box.h);
    bg.append(s("foreignObject", { x: ta.x, y: ta.y, width: ta.w, height: ta.h }, boxText(box.text)));
    bg.append(...drawBadges(box));
    if (interactive) {
      const local = { x: 0, y: 0, w: box.w, h: box.h, shape: box.shape };
      for (const side of SIDES) {
        const a = anchor(local, side);
        bg.append(s("circle", { class: "anchor", cx: a.x, cy: a.y, r: 6, "data-anchor": side }));
      }
      if (selected) {
        bg.append(s("rect", { class: "resize-handle", x: box.w - 5, y: box.h - 5, width: 10, height: 10, "data-resize": "1" }));
      }
    }
    boxesG.append(bg);
  }

  const ghostsG = s("g", { class: "ghosts" });
  ghosts.forEach((ghost, i) => {
    const from = byId.get(ghost.from.box);
    const to = byId.get(ghost.to.box);
    const d = pathD(routePoints(anchor(from, ghost.from.side), ghost.from.side, anchor(to, ghost.to.side), ghost.to.side));
    ghostsG.append(
      s(
        "g",
        { class: "ghost", "data-ghost": i, "data-from": ghost.from.box, "data-to": ghost.to.box },
        s("title", {}, "Click to add this arrow"),
        s("path", { class: "ghost-hit", d }),
        s("path", { class: "ghost-line", d, "marker-end": `url(#${prefix}-arrow-ghost)` }),
      ),
    );
  });

  // Ghosts sit under boxes so they never steal clicks meant for a box; arrow
  // labels sit above boxes so short arrows don't hide them.
  g.append(drawSidebar(layout, { selection, interactive }), drawLanes(layout, { selection, dropLane, interactive }), edgesG, ghostsG, boxesG, labelsG);

  if (connect) {
    const p1 = anchor(byId.get(connect.from.box), connect.from.side);
    let d;
    const targetBox = connect.target && byId.get(connect.target);
    if (targetBox) {
      const side = nearestSide(targetBox, connect.pt);
      d = pathD(routePoints(p1, connect.from.side, anchor(targetBox, side), side));
    } else {
      d = `M${p1.x} ${p1.y} L${connect.pt.x} ${connect.pt.y}`;
    }
    g.append(s("path", { class: "temp-line", d }));
  }
}

export class Canvas {
  constructor(wrap, chart, { onChange = () => {}, onSelect = () => {} } = {}) {
    this.wrap = wrap;
    this.chart = chart;
    this.onChange = onChange;
    this.onSelect = onSelect;
    this.view = { x: HEADER_W + 20, y: 20, k: 1 };
    this.selection = null;
    this.drag = null;
    this.lastDown = null;
    this.editing = null;
    this.ghosts = [];
    this.layout = layoutChart(chart);

    this.svg = createSvg("cv");
    this.svg.classList.add("interactive");
    this.viewport = s("g");
    this.svg.append(this.viewport);
    wrap.append(this.svg);

    this.svg.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.svg.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.svg.addEventListener("pointerup", (e) => this.pointerUp(e));
    this.svg.addEventListener("pointercancel", () => { this.drag = null; this.render(); });
    this.svg.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    wrap.addEventListener("dragover", (e) => e.preventDefault());
    wrap.addEventListener("drop", (e) => this.drop(e));

    this.render();
  }

  // ---- coordinates -------------------------------------------------------

  toWorld(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    return { x: (clientX - r.left - this.view.x) / this.view.k, y: (clientY - r.top - this.view.y) / this.view.k };
  }

  visibleCenter() {
    const r = this.svg.getBoundingClientRect();
    return this.toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  absBox(id) {
    return this.layout.boxes.find((b) => b.id === id) || null;
  }

  fitView() {
    const bb = layoutBounds(this.layout);
    bb.h += ADD_LANE_H;
    const r = this.svg.getBoundingClientRect();
    if (!r.width) return;
    const k = clamp(Math.min((r.width - 40) / bb.w, (r.height - 40) / bb.h), MIN_ZOOM, 1);
    // Keep the chart pinned to the top-left so lane headers stay in view.
    this.view = { k, x: 20 - bb.x * k, y: 20 - bb.y * k };
    this.render();
  }

  // ---- state -------------------------------------------------------------

  select(selection) {
    this.selection = selection;
    this.onSelect(selection);
  }

  changed() {
    // An edit in between two clicks means they aren't a double-click.
    this.lastDown = null;
    this.onChange();
    this.render();
  }

  selectedBox() {
    return this.selection?.type === "box" ? M.getBox(this.chart, this.selection.id) : null;
  }

  selectedLane() {
    return this.selection?.type === "lane" ? M.getLane(this.chart, this.selection.id) : null;
  }

  deleteSelection() {
    const sel = this.selection;
    if (!sel) return;
    if (sel.type === "box") M.deleteBox(this.chart, sel.id);
    else if (sel.type === "edge") M.deleteEdge(this.chart, sel.id);
    else if (sel.type === "item") T.deleteItem(this.chart, sel.id);
    else if (sel.type === "section") {
      const section = T.getSection(this.chart, sel.id);
      const n = section.items.length;
      if (n && !window.confirm(`Delete section "${section.name}" and its ${n} item${n === 1 ? "" : "s"}?`)) return;
      T.deleteSection(this.chart, sel.id);
    } else if (sel.type === "sidebar") {
      if (T.allItems(this.chart).length && !window.confirm("Remove the side column and everything in it?")) return;
      M.setSidebar(this.chart, false);
    }
    else if (sel.type === "lane") {
      const lane = M.getLane(this.chart, sel.id);
      if (this.chart.lanes.length <= 1) {
        window.alert("A chart needs at least one lane.");
        return;
      }
      const n = M.boxesInLane(this.chart, sel.id).length;
      const msg = n ? `Delete lane "${lane.name}" and its ${n} box${n === 1 ? "" : "es"}?` : `Delete lane "${lane.name}"?`;
      if (!window.confirm(msg)) return;
      M.deleteLane(this.chart, sel.id);
    }
    this.select(null);
    this.changed();
  }

  setColor(color) {
    const target = this.selectedBox() || this.selectedLane();
    if (!target) return;
    target.color = color;
    this.changed();
  }

  setShape(shape) {
    const box = this.selectedBox();
    if (box && M.setShape(this.chart, box.id, shape)) this.changed();
  }

  selectedItem() {
    return this.selection?.type === "item" ? T.getItem(this.chart, this.selection.id) : null;
  }

  // A box or tracker item, by id. Both carry text and badges.
  owner(id) {
    return M.getBox(this.chart, id) || T.getItem(this.chart, id);
  }

  addBadge(type) {
    const target = this.selectedBox() || this.selectedItem();
    const t = badgeType(type);
    if (!target || !t) return;
    const text = window.prompt(`${t.name} badge text (e.g. ${t.example}):`, t.example);
    if (text === null) return;
    if (addBadge(target, type, text)) this.changed();
  }

  editBadge(ownerId, index) {
    const target = this.owner(ownerId);
    const badge = target?.badges?.[index];
    if (!badge) return;
    const text = window.prompt(`${badgeType(badge.type).name} badge text. Leave empty to remove it:`, badge.text);
    if (text === null) return;
    updateBadge(target, index, text);
    this.changed();
  }

  removeBadge(ownerId, index) {
    removeBadge(this.owner(ownerId), index);
    this.changed();
  }

  // ---- tracker side column ----------------------------------------------

  setSidebar(on) {
    if (!on) {
      this.select({ type: "sidebar", id: "sidebar" });
      this.deleteSelection();
      return;
    }
    M.setSidebar(this.chart, true);
    this.select({ type: "sidebar", id: "sidebar" });
    this.changed();
    // The column appears left of the lanes, likely out of view.
    this.fitView();
  }

  addSection(afterId = null) {
    const section = T.addSection(this.chart, afterId);
    if (!section) return;
    this.select({ type: "section", id: section.id });
    this.changed();
  }

  renameSection(id) {
    const section = T.getSection(this.chart, id);
    if (!section) return;
    const name = window.prompt("Section name:", section.name);
    if (name === null || !T.renameSection(this.chart, id, name)) return;
    this.changed();
  }

  moveSection(delta) {
    if (this.selection?.type === "section" && T.moveSection(this.chart, this.selection.id, delta)) this.changed();
  }

  // After the selected item, or at the end of the selected section.
  addItem() {
    const sel = this.selection;
    const item = T.addItem(this.chart, sel?.type === "item" ? { afterId: sel.id } : { sectionId: sel?.id });
    if (!item) return;
    this.select({ type: "item", id: item.id });
    this.changed();
    this.startEdit(item.id);
  }

  moveItem(delta) {
    const item = this.selectedItem();
    if (item && T.moveItem(this.chart, item.id, delta)) this.changed();
  }

  setCount(count) {
    const item = this.selectedItem();
    if (!item) return;
    T.updateItem(this.chart, item.id, { count });
    this.changed();
  }

  // Lane-relative y for a box whose top-left would be at absolute y.
  relativeY(lane, absY) {
    return absY - lane.top;
  }

  laneBoxes(laneId) {
    return M.boxesInLane(this.chart, laneId);
  }

  // Add a box from a palette card. With a drop point it lands there. Otherwise
  // it goes right of the selected box, at the end of the selected lane, or into
  // the lane in the middle of the view, wrapping to a new row in the lane when
  // the page edge is reached. Cards without a color take the lane's.
  addCard(card, at = null) {
    const size = M.shapeSize(card.shape);
    let lane, x, y;
    if (at) {
      lane = laneAt(this.layout, at.y);
      x = at.x - size.w / 2;
      y = this.relativeY(lane, at.y - size.h / 2);
    } else if (this.selectedBox()) {
      const sel = this.absBox(this.selection.id);
      lane = this.layout.lanes.find((l) => l.id === sel.lane);
      ({ x, y } = findSlot(this.laneBoxes(lane.id), { x: sel.x + sel.w + SLOT_GAP_X, y: this.relativeY(lane, sel.y), ...size }, boxMaxRight(this.chart)));
    } else {
      const laneSel = this.selectedLane();
      lane = laneSel ? this.layout.lanes.find((l) => l.id === laneSel.id) : laneAt(this.layout, this.visibleCenter().y);
      ({ x, y } = endOfLane(this.laneBoxes(lane.id), size, boxMaxRight(this.chart)));
    }
    const box = M.addBox(this.chart, { lane: lane.id, x, y, ...size, shape: card.shape, text: card.text, color: card.color || lane.color });
    this.select({ type: "box", id: box.id });
    this.changed();
    return box;
  }

  addLane(afterId = null) {
    const lane = M.addLane(this.chart, afterId);
    this.select({ type: "lane", id: lane.id });
    this.changed();
    return lane;
  }

  moveLane(delta) {
    const lane = this.selectedLane();
    if (lane && M.moveLane(this.chart, lane.id, delta)) this.changed();
  }

  // ---- text editing ------------------------------------------------------

  // Edit a box's or tracker item's text in place.
  startEdit(id) {
    this.finishEdit(true);
    const target = this.owner(id);
    if (!target) return;
    const ta = h("textarea", { class: "box-editor", spellcheck: "false" });
    ta.value = target.text;
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        this.finishEdit(false);
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.finishEdit(true);
      }
    });
    ta.addEventListener("blur", () => this.finishEdit(true));
    this.editing = { id, ta };
    this.wrap.append(ta);
    this.positionEditor();
    ta.focus();
    ta.select();
  }

  finishEdit(commit) {
    if (!this.editing) return;
    const { id, ta } = this.editing;
    this.editing = null;
    const target = this.owner(id);
    ta.remove();
    if (commit && target && ta.value !== target.text) {
      target.text = ta.value;
      this.changed();
    } else {
      this.render();
    }
  }

  positionEditor() {
    if (!this.editing) return;
    const id = this.editing.id;
    const box = this.absBox(id) || this.layout.sidebar.items.find((i) => i.id === id);
    if (!box) return;
    const { x, y, k } = this.view;
    Object.assign(this.editing.ta.style, {
      left: `${box.x * k + x}px`,
      top: `${box.y * k + y}px`,
      width: `${box.w * k}px`,
      height: `${box.h * k}px`,
      fontSize: `${14 * k}px`,
      background: box.color || "#fff",
    });
  }

  editEdgeLabel(id) {
    const edge = this.chart.edges.find((e) => e.id === id);
    if (!edge) return;
    const label = window.prompt("Arrow label (e.g. yes / no). Leave empty for none:", edge.label || "");
    if (label === null) return;
    edge.label = label.trim();
    this.changed();
  }

  renameLane(id) {
    const lane = M.getLane(this.chart, id);
    if (!lane) return;
    const name = window.prompt("Lane name:", lane.name);
    if (name === null || !name.trim()) return;
    lane.name = name.trim();
    this.changed();
  }

  // ---- pointer handling --------------------------------------------------

  pointerDown(e) {
    if (e.button !== 0) return;
    if (this.editing) this.finishEdit(true);
    const pt = this.toWorld(e.clientX, e.clientY);
    const t = e.target;
    const ghostEl = t.closest("[data-ghost]");
    const anchorEl = t.closest("[data-anchor]");
    const resizeEl = t.closest("[data-resize]");
    const boxEl = t.closest("[data-box]");
    const badgeEl = t.closest("[data-badge]");
    const edgeEl = t.closest("[data-edge]");
    const laneEl = t.closest("[data-lane]");
    const addLaneEl = t.closest("[data-add-lane]");
    const itemEl = t.closest("[data-item]");
    const sectionEl = t.closest("[data-section]");
    const sidebarEl = t.closest("[data-sidebar]");
    const ownerId = boxEl?.dataset.box || itemEl?.dataset.item;

    // Our own double-click detection: rendering replaces elements between
    // clicks, which makes native dblclick unreliable.
    const key = badgeEl && ownerId ? `badge:${ownerId}:${badgeEl.dataset.badge}`
      : boxEl && !anchorEl && !resizeEl ? `box:${boxEl.dataset.box}`
      : itemEl ? `item:${itemEl.dataset.item}`
      : sectionEl ? `section:${sectionEl.dataset.section}`
      : sidebarEl ? "sidebar"
      : edgeEl ? `edge:${edgeEl.dataset.edge}`
      : laneEl ? `lane:${laneEl.dataset.lane}`
      : !ghostEl && !anchorEl && !resizeEl && !addLaneEl ? "empty" : null;
    const now = performance.now();
    const last = this.lastDown;
    this.lastDown = key ? { key, time: now, x: e.clientX, y: e.clientY } : null;
    if (key && last && last.key === key && now - last.time < DOUBLE_CLICK_MS
        && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6) {
      this.lastDown = null;
      // Defer until the mousedown that follows has finished moving focus,
      // otherwise it would immediately blur the text editor we open.
      setTimeout(() => this.doubleClick(key, pt), 0);
      return;
    }

    if (ghostEl) {
      const ghost = this.ghosts[Number(ghostEl.dataset.ghost)];
      if (ghost) M.addEdge(this.chart, ghost.from, ghost.to);
      this.changed();
      return;
    }
    if (addLaneEl) {
      this.addLane();
      return;
    }

    if (anchorEl && boxEl) {
      this.drag = { type: "connect", from: { box: boxEl.dataset.box, side: anchorEl.dataset.anchor }, pt, target: null };
    } else if (resizeEl && boxEl) {
      const box = M.getBox(this.chart, boxEl.dataset.box);
      this.drag = { type: "resize", id: box.id, start: pt, w: box.w, h: box.h, moved: false };
    } else if (boxEl) {
      const box = this.absBox(boxEl.dataset.box);
      this.select({ type: "box", id: box.id });
      M.bringToFront(this.chart, box.id);
      this.drag = {
        type: "move", id: box.id, dx: pt.x - box.x, dy: pt.y - box.y,
        x: box.x, y: box.y, w: box.w, h: box.h, lanes: this.layout.lanes, moved: false,
      };
    } else if (itemEl) {
      this.select({ type: "item", id: itemEl.dataset.item });
    } else if (sectionEl) {
      this.select({ type: "section", id: sectionEl.dataset.section });
    } else if (sidebarEl) {
      this.select({ type: "sidebar", id: "sidebar" });
    } else if (edgeEl) {
      this.select({ type: "edge", id: edgeEl.dataset.edge });
    } else if (laneEl) {
      this.select({ type: "lane", id: laneEl.dataset.lane });
    } else {
      this.select(null);
      this.drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
    }
    this.svg.setPointerCapture(e.pointerId);
    this.render();
  }

  doubleClick(key, pt) {
    const [kind, id, index] = key.split(":");
    if (kind === "badge") {
      this.editBadge(id, Number(index));
    } else if (kind === "box" || kind === "item") {
      this.startEdit(id);
    } else if (kind === "section") {
      this.renameSection(id);
    } else if (kind === "sidebar") {
      // Nothing to add on the column's background.
    } else if (kind === "edge") {
      this.editEdgeLabel(id);
    } else if (kind === "lane") {
      this.renameLane(id);
    } else {
      const box = this.addCard({ text: "", color: null }, pt);
      this.startEdit(box.id);
    }
  }

  // Lane a moving box would land in: where its vertical center is.
  dropLaneFor(d) {
    return laneAt({ lanes: d.lanes }, d.y + d.h / 2);
  }

  pointerMove(e) {
    const d = this.drag;
    if (!d) return;
    const pt = this.toWorld(e.clientX, e.clientY);
    if (d.type === "move") {
      const nx = M.clampX(pt.x - d.dx, d.w, boxMaxRight(this.chart)), ny = M.snap(pt.y - d.dy);
      if (nx === d.x && ny === d.y) return;
      d.x = nx;
      d.y = ny;
      d.moved = true;
    } else if (d.type === "resize") {
      M.resizeBox(this.chart, d.id, d.w + pt.x - d.start.x, d.h + pt.y - d.start.y);
      d.moved = true;
    } else if (d.type === "connect") {
      d.pt = pt;
      const over = boxAt(this.layout.boxes, pt);
      d.target = over && over.id !== d.from.box ? over.id : null;
    } else if (d.type === "pan") {
      this.view.x = d.vx + e.clientX - d.sx;
      this.view.y = d.vy + e.clientY - d.sy;
    }
    this.render();
  }

  pointerUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.type === "connect" && d.target) {
      const target = this.absBox(d.target);
      const pt = this.toWorld(e.clientX, e.clientY);
      M.addEdge(this.chart, d.from, { box: target.id, side: nearestSide(target, pt) });
      this.changed();
    } else if (d.type === "move" && d.moved) {
      const lane = this.dropLaneFor(d);
      M.moveBox(this.chart, d.id, lane.id, d.x, this.relativeY(lane, d.y));
      this.changed();
    } else if (d.type === "resize" && d.moved) {
      this.changed();
    } else {
      this.render();
    }
  }

  wheel(e) {
    e.preventDefault();
    const r = this.svg.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = clamp(this.view.k * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
    const ratio = k / this.view.k;
    this.view = { k, x: mx - (mx - this.view.x) * ratio, y: my - (my - this.view.y) * ratio };
    this.render();
  }

  zoomBy(factor) {
    const r = this.svg.getBoundingClientRect();
    this.wheel({ preventDefault() {}, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaY: -Math.log(factor) / 0.0015 });
  }

  drop(e) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/x-charflow") || e.dataTransfer.getData("text/plain");
    let card;
    try {
      card = JSON.parse(raw);
    } catch {
      return;
    }
    if (card && typeof card.text === "string") this.addCard(card, this.toWorld(e.clientX, e.clientY));
  }

  // ---- render ------------------------------------------------------------

  render() {
    const d = this.drag;
    const moving = d?.type === "move" && d.moved;
    // While a box is being dragged, lanes keep the geometry they had when the
    // drag started; the box floats and is assigned a lane on drop.
    this.layout = moving
      ? layoutChart(this.chart, { frozen: d.lanes, floating: { id: d.id, x: d.x, y: d.y } })
      : layoutChart(this.chart);
    const boxSelected = this.selection?.type === "box" && M.getBox(this.chart, this.selection.id);
    this.ghosts = boxSelected && d?.type !== "connect"
      ? suggestEdges(this.layout.boxes, this.chart.edges, this.selection.id)
      : [];
    drawChart(this.viewport, this.chart, this.layout, {
      prefix: "cv",
      selection: this.selection,
      ghosts: this.ghosts,
      connect: d?.type === "connect" ? d : null,
      dropLane: moving ? this.dropLaneFor(d).id : null,
      interactive: true,
    });
    const { x, y, k } = this.view;
    this.viewport.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
    this.svg.classList.toggle("connecting", d?.type === "connect");
    this.svg.classList.toggle("panning", d?.type === "pan");
    this.wrap.style.backgroundSize = `${GRID_PX * k}px ${GRID_PX * k}px`;
    this.wrap.style.backgroundPosition = `${x}px ${y}px`;
    this.positionEditor();
  }
}
