// SVG flowchart rendering and pointer interactions.

import { h, s } from "./dom.js";
import {
  SIDES, anchor, boxAt, boundingBox, edgePoints, nearestSide, pathD,
  polylineMidpoint, routePoints, suggestEdges,
} from "./geometry.js";
import * as M from "./model.js";

const DOUBLE_CLICK_MS = 400;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const GRID_PX = 20;

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

// Draw the chart into group `g`. Used both by the interactive canvas and print.
export function drawChart(g, chart, opts = {}) {
  const { prefix = "c", selection = null, ghosts = [], connect = null, interactive = false } = opts;
  g.replaceChildren();

  const edgesG = s("g", { class: "edges" });
  for (const edge of chart.edges) {
    const pts = edgePoints(chart.boxes, edge);
    if (!pts) continue;
    const selected = selection?.type === "edge" && selection.id === edge.id;
    const d = pathD(pts);
    const eg = s("g", { class: `edge${selected ? " selected" : ""}`, "data-edge": edge.id });
    if (interactive) eg.append(s("path", { class: "edge-hit", d }));
    eg.append(s("path", { class: "edge-line", d, "marker-end": `url(#${prefix}-arrow${selected ? "-sel" : ""})` }));
    if (edge.label) {
      const m = polylineMidpoint(pts);
      eg.append(s("text", { class: "edge-label", x: m.x, y: m.y, "text-anchor": "middle", "dominant-baseline": "central" }, edge.label));
    }
    edgesG.append(eg);
  }

  const boxesG = s("g", { class: "boxes" });
  for (const box of chart.boxes) {
    const selected = selection?.type === "box" && selection.id === box.id;
    const target = connect?.target === box.id;
    const bg = s("g", {
      class: `box${selected ? " selected" : ""}${target ? " drop-target" : ""}`,
      "data-box": box.id,
      transform: `translate(${box.x} ${box.y})`,
    });
    bg.append(s("rect", { class: "box-rect", width: box.w, height: box.h, rx: 6, fill: box.color }));
    bg.append(s("foreignObject", { x: 0, y: 0, width: box.w, height: box.h }, boxText(box.text)));
    if (interactive) {
      const local = { x: 0, y: 0, w: box.w, h: box.h };
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
    const from = M.getBox(chart, ghost.from.box);
    const to = M.getBox(chart, ghost.to.box);
    const d = pathD(routePoints(anchor(from, ghost.from.side), ghost.from.side, anchor(to, ghost.to.side), ghost.to.side));
    ghostsG.append(
      s(
        "g",
        { class: "ghost", "data-ghost": i },
        s("title", {}, "Click to add this arrow"),
        s("path", { class: "ghost-hit", d }),
        s("path", { class: "ghost-line", d, "marker-end": `url(#${prefix}-arrow-ghost)` }),
      ),
    );
  });

  // Ghosts sit under boxes so they never steal clicks meant for a box.
  g.append(edgesG, ghostsG, boxesG);

  if (connect) {
    const fromBox = M.getBox(chart, connect.from.box);
    const p1 = anchor(fromBox, connect.from.side);
    let d;
    const targetBox = connect.target && M.getBox(chart, connect.target);
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
    this.view = { x: 40, y: 40, k: 1 };
    this.selection = null;
    this.drag = null;
    this.lastDown = null;
    this.editing = null;
    this.ghosts = [];

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

  fitView() {
    const bb = boundingBox(this.chart.boxes);
    const r = this.svg.getBoundingClientRect();
    if (!bb || !r.width) {
      this.view = { x: 40, y: 40, k: 1 };
    } else {
      const k = clamp(Math.min((r.width - 80) / bb.w, (r.height - 80) / bb.h), MIN_ZOOM, 1.25);
      this.view = { k, x: (r.width - bb.w * k) / 2 - bb.x * k, y: (r.height - bb.h * k) / 2 - bb.y * k };
    }
    this.render();
  }

  // ---- state -------------------------------------------------------------

  select(selection) {
    this.selection = selection;
    this.onSelect(selection);
  }

  changed() {
    this.onChange();
    this.render();
  }

  selectedBox() {
    return this.selection?.type === "box" ? M.getBox(this.chart, this.selection.id) : null;
  }

  selectedEdge() {
    return this.selection?.type === "edge" ? this.chart.edges.find((e) => e.id === this.selection.id) : null;
  }

  deleteSelection() {
    if (!this.selection) return;
    if (this.selection.type === "box") M.deleteBox(this.chart, this.selection.id);
    else M.deleteEdge(this.chart, this.selection.id);
    this.select(null);
    this.changed();
  }

  setColor(color) {
    const box = this.selectedBox();
    if (!box) return;
    box.color = color;
    this.changed();
  }

  // Add a box from a palette card. Without a drop point it goes to the right
  // of the selected box (the natural next step) or the middle of the view.
  addCard(card, at = null) {
    let x, y;
    if (at) {
      x = at.x - M.BOX_W / 2;
      y = at.y - M.BOX_H / 2;
    } else {
      const sel = this.selectedBox();
      if (sel) {
        x = sel.x + sel.w + 60;
        y = sel.y;
      } else {
        const c = this.visibleCenter();
        x = c.x - M.BOX_W / 2;
        y = c.y - M.BOX_H / 2;
      }
      while (boxAt(this.chart.boxes, { x: x + 10, y: y + 10 })) y += M.BOX_H + 30;
    }
    const box = M.addBox(this.chart, { x, y, text: card.text, color: card.color });
    this.select({ type: "box", id: box.id });
    this.changed();
    return box;
  }

  // ---- text editing ------------------------------------------------------

  startEdit(id) {
    this.finishEdit(true);
    const box = M.getBox(this.chart, id);
    if (!box) return;
    const ta = h("textarea", { class: "box-editor", spellcheck: "false" });
    ta.value = box.text;
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
    const box = M.getBox(this.chart, id);
    ta.remove();
    if (commit && box && ta.value !== box.text) {
      box.text = ta.value;
      this.changed();
    } else {
      this.render();
    }
  }

  positionEditor() {
    if (!this.editing) return;
    const box = M.getBox(this.chart, this.editing.id);
    if (!box) return;
    const { x, y, k } = this.view;
    Object.assign(this.editing.ta.style, {
      left: `${box.x * k + x}px`,
      top: `${box.y * k + y}px`,
      width: `${box.w * k}px`,
      height: `${box.h * k}px`,
      fontSize: `${14 * k}px`,
      background: box.color,
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
    const edgeEl = t.closest("[data-edge]");

    // Our own double-click detection: rendering replaces elements between
    // clicks, which makes native dblclick unreliable.
    const key = boxEl && !anchorEl && !resizeEl ? `box:${boxEl.dataset.box}`
      : edgeEl ? `edge:${edgeEl.dataset.edge}`
      : !ghostEl && !anchorEl && !resizeEl ? "empty" : null;
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

    if (anchorEl && boxEl) {
      this.drag = { type: "connect", from: { box: boxEl.dataset.box, side: anchorEl.dataset.anchor }, pt, target: null };
    } else if (resizeEl && boxEl) {
      const box = M.getBox(this.chart, boxEl.dataset.box);
      this.drag = { type: "resize", id: box.id, start: pt, w: box.w, h: box.h, moved: false };
    } else if (boxEl) {
      const box = M.getBox(this.chart, boxEl.dataset.box);
      this.select({ type: "box", id: box.id });
      M.bringToFront(this.chart, box.id);
      this.drag = { type: "move", id: box.id, dx: pt.x - box.x, dy: pt.y - box.y, moved: false };
    } else if (edgeEl) {
      this.select({ type: "edge", id: edgeEl.dataset.edge });
    } else {
      this.select(null);
      this.drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
    }
    this.svg.setPointerCapture(e.pointerId);
    this.render();
  }

  doubleClick(key, pt) {
    const [kind, id] = key.split(":");
    if (kind === "box") {
      this.startEdit(id);
    } else if (kind === "edge") {
      this.editEdgeLabel(id);
    } else {
      const box = this.addCard({ text: "", color: M.CATEGORY_COLORS.action }, pt);
      this.startEdit(box.id);
    }
  }

  pointerMove(e) {
    const d = this.drag;
    if (!d) return;
    const pt = this.toWorld(e.clientX, e.clientY);
    if (d.type === "move") {
      const box = M.getBox(this.chart, d.id);
      const nx = M.snap(pt.x - d.dx), ny = M.snap(pt.y - d.dy);
      if (nx === box.x && ny === box.y) return;
      M.moveBox(this.chart, d.id, nx, ny);
      d.moved = true;
    } else if (d.type === "resize") {
      M.resizeBox(this.chart, d.id, d.w + pt.x - d.start.x, d.h + pt.y - d.start.y);
      d.moved = true;
    } else if (d.type === "connect") {
      d.pt = pt;
      const over = boxAt(this.chart.boxes, pt);
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
      const target = M.getBox(this.chart, d.target);
      const pt = this.toWorld(e.clientX, e.clientY);
      M.addEdge(this.chart, d.from, { box: target.id, side: nearestSide(target, pt) });
      this.changed();
    } else if ((d.type === "move" || d.type === "resize") && d.moved) {
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
    const boxSelected = this.selection?.type === "box" && M.getBox(this.chart, this.selection.id);
    this.ghosts = boxSelected && this.drag?.type !== "connect"
      ? suggestEdges(this.chart.boxes, this.chart.edges, this.selection.id)
      : [];
    drawChart(this.viewport, this.chart, {
      prefix: "cv",
      selection: this.selection,
      ghosts: this.ghosts,
      connect: this.drag?.type === "connect" ? this.drag : null,
      interactive: true,
    });
    const { x, y, k } = this.view;
    this.viewport.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
    this.svg.classList.toggle("connecting", this.drag?.type === "connect");
    this.svg.classList.toggle("panning", this.drag?.type === "pan");
    this.wrap.style.backgroundSize = `${GRID_PX * k}px ${GRID_PX * k}px`;
    this.wrap.style.backgroundPosition = `${x}px ${y}px`;
    this.positionEditor();
  }
}
