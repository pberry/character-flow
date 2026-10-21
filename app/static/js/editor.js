// The flowchart editor screen: top bar, selection toolbar, palette and canvas.

import * as api from "./api.js";
import { BADGE_TYPES, badgePathD, badgeType } from "./badges.js";
import { Canvas } from "./canvas.js";
import { h, s } from "./dom.js";
import { COLORS } from "./model.js";
import { renderPalette } from "./palette.js";
import { buildPrintSheet } from "./print.js";
import { SHAPES, shapePathD } from "./shapes.js";
import { MAX_COUNT, getItem, getSection } from "./sidebar.js";
import { GROUP_STYLES, getGroup } from "./groups.js";

const AUTOSAVE_MS = 2000;

function shapeIcon(shape) {
  const w = 24, ht = 18;
  const d = shapePathD(shape, w, ht);
  return s(
    "svg",
    { class: "shape-icon", width: w + 2, height: ht + 2, viewBox: `-1 -1 ${w + 2} ${ht + 2}`, "aria-hidden": "true" },
    d ? s("path", { d }) : s("rect", { width: w, height: ht, rx: 3 }),
  );
}

function badgeIcon(type, color = null) {
  const t = badgeType(type);
  const w = 16, ht = type === "duration" ? 10 : type === "modifier" ? 14 : 16;
  return s(
    "svg",
    { class: "badge-icon", width: 18, height: 18, viewBox: "-9 -9 18 18", "aria-hidden": "true" },
    s("path", { d: badgePathD(type, w, ht), fill: color || t.fill, stroke: t.stroke }),
  );
}

// Color swatches; `current` is the active value.
function swatches(current, onPick) {
  return COLORS.map((c) =>
    h("button", {
      class: `swatch${current === c.value ? " active" : ""}`,
      title: c.name,
      "aria-label": c.name,
      style: { background: c.value },
      onclick: () => onPick(c.value),
    }),
  );
}

// Badge chips and add buttons for a box, tracker item, or lane (`box`).
function badgeControls(canvas, box) {
  const chips = (box.badges || []).map((b, i) => {
    const name = badgeType(b.type)?.name || b.type;
    return h(
      "span",
      { class: "badge-chip" },
      h("button", { class: "btn chip-text", title: `Select this ${name.toLowerCase()} badge to edit or recolor it`,
        "aria-label": `Select ${name.toLowerCase()} badge ${b.text}`, onclick: () => canvas.selectBadge(box.id, i) },
        badgeIcon(b.type, b.color), b.text),
      h("button", { class: "btn chip-remove", title: "Remove badge", "aria-label": `Remove ${name.toLowerCase()} badge ${b.text}`,
        onclick: () => canvas.removeBadge(box.id, i) }, "×"),
    );
  });
  const adds = BADGE_TYPES.map((t) =>
    h("button", {
      class: "btn add-badge", title: `Add a ${t.name.toLowerCase()} badge, e.g. ${t.example}`,
      "aria-label": `Add ${t.name.toLowerCase()} badge`, onclick: () => canvas.addBadge(t.id),
    }, badgeIcon(t.id), `+ ${t.name}`),
  );
  return [h("span", { class: "label" }, "Badges"), ...chips, ...adds];
}

// Returns a cleanup function that flushes pending saves and unhooks listeners.
export function showEditor(container, chartRecord) {
  const chart = chartRecord.data;
  let dirty = false;
  let timer = null;
  let saving = Promise.resolve();

  const status = h("span", { class: "status" }, "Saved");
  const nameEl = h("h1", { class: "chart-name", title: "Click to rename" }, chartRecord.name);
  const toolbar = h("div", { class: "toolbar" });
  const palette = h("aside", { class: "palette" });
  const wrap = h("div", { class: "canvas-wrap" });

  function setStatus(text, cls = "") {
    status.textContent = text;
    status.className = `status ${cls}`;
  }

  function save() {
    clearTimeout(timer);
    saving = saving.then(async () => {
      if (!dirty) return;
      dirty = false;
      setStatus("Saving…");
      try {
        await api.updateChart(chartRecord.id, { data: chart });
        setStatus(dirty ? "Unsaved changes" : "Saved");
      } catch (err) {
        dirty = true;
        setStatus(`Save failed: ${err.message}`, "error");
      }
    });
    return saving;
  }

  function markDirty() {
    dirty = true;
    setStatus("Unsaved changes");
    clearTimeout(timer);
    timer = setTimeout(save, AUTOSAVE_MS);
  }

  async function rename() {
    const name = window.prompt("Rename chart:", chartRecord.name);
    if (!name || !name.trim() || name.trim() === chartRecord.name) return;
    try {
      const updated = await api.updateChart(chartRecord.id, { name: name.trim() });
      chartRecord.name = updated.name;
      nameEl.textContent = updated.name;
    } catch (err) {
      alert(err.message);
    }
  }

  function renderToolbar(selection) {
    const items = [];
    if (selection?.type === "box") {
      const box = canvas.selectedBox();
      items.push(
        h("span", { class: "label" }, "Color"),
        swatches(box?.color, (c) => canvas.setColor(c)),
        h("span", { class: "sep" }),
        h("span", { class: "label" }, "Shape"),
        SHAPES.map((sh) =>
          h("button", {
            class: `btn icon shape-btn${(box?.shape || "rect") === sh.id ? " active" : ""}`,
            title: sh.name,
            "aria-label": sh.name,
            "aria-pressed": String((box?.shape || "rect") === sh.id),
            onclick: () => canvas.setShape(sh.id),
          }, shapeIcon(sh.id)),
        ),
        h("span", { class: "sep" }),
        box ? badgeControls(canvas, box) : null,
        h("span", { class: "sep" }),
        h("button", { class: "btn", onclick: () => canvas.startEdit(selection.id) }, "Edit text"),
        h("button", { class: "btn danger", onclick: () => canvas.deleteSelection() }, "Delete box"),
        h("button", { class: "btn", title: "Draw a bracket around this box", onclick: () => canvas.groupSelection() }, "Group"),
        h("span", { class: "hint" }, "Faint dashed arrows are suggestions — click one to keep it. Shift-click to select more boxes."),
      );
    } else if (selection?.type === "badge" && canvas.selectedBadge()) {
      const { badge } = canvas.selectedBadge();
      const type = badgeType(badge.type);
      const owner = canvas.ownerSelection(selection.owner);
      const ownerName = owner?.type || "box";
      const text = h("input", { class: "lane-name-input", value: badge.text, "aria-label": "Badge text" });
      // Commit on Enter/blur; empty text removes the badge.
      text.addEventListener("change", () => canvas.setBadgeText(text.value));
      text.addEventListener("keydown", (e) => { if (e.key === "Enter") text.blur(); });
      items.push(
        h("span", { class: "label" }, `${type.name} badge`),
        text,
        h("span", { class: "sep" }),
        h("span", { class: "label" }, "Color"),
        h("button", {
          class: `swatch default-color${badge.color ? "" : " active"}`,
          title: `Default ${type.name.toLowerCase()} color`,
          "aria-label": "Default color",
          style: { background: type.fill },
          onclick: () => canvas.setBadgeColor(null),
        }),
        swatches(badge.color, (c) => canvas.setBadgeColor(c)),
        h("span", { class: "sep" }),
        h("button", { class: "btn", onclick: () => { canvas.select(owner); canvas.render(); } }, `Select ${ownerName}`),
        h("button", { class: "btn danger", onclick: () => canvas.deleteSelection() }, "Remove badge"),
        h("span", { class: "hint" }, "Empty text removes the badge. Esc goes back to its " + ownerName + "."),
      );
    } else if (selection?.type === "lane") {
      const lane = canvas.selectedLane();
      const i = chart.lanes.indexOf(lane);
      const name = h("input", { class: "lane-name-input", value: lane.name, "aria-label": "Lane name" });
      // Commit on Enter/blur: re-rendering the toolbar on every keystroke would steal focus.
      name.addEventListener("change", () => {
        if (name.value.trim()) { lane.name = name.value.trim(); canvas.changed(); }
      });
      name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); });
      items.push(
        h("span", { class: "label" }, "Lane"),
        name,
        h("span", { class: "sep" }),
        h("span", { class: "label" }, "Color"),
        swatches(lane.color, (c) => canvas.setColor(c)),
        h("span", { class: "sep" }),
        badgeControls(canvas, lane),
        h("span", { class: "sep" }),
        h("button", { class: "btn icon", title: "Move lane up", "aria-label": "Move lane up", disabled: i === 0, onclick: () => canvas.moveLane(-1) }, "↑"),
        h("button", { class: "btn icon", title: "Move lane down", "aria-label": "Move lane down", disabled: i === chart.lanes.length - 1, onclick: () => canvas.moveLane(1) }, "↓"),
        h("button", { class: "btn", onclick: () => canvas.addLane(lane.id) }, "Add lane below"),
        h("button", { class: "btn danger", disabled: chart.lanes.length <= 1, onclick: () => canvas.deleteSelection() }, "Delete lane"),
        h("span", { class: "hint" }, "Click palette cards to add them to this lane."),
      );
    } else if (selection?.type === "boxes") {
      items.push(
        h("span", { class: "label" }, `${selection.ids.length} boxes selected`),
        h("button", { class: "btn primary", title: "Draw a bracket around these boxes", onclick: () => canvas.groupSelection() }, "Group"),
        h("button", { class: "btn danger", onclick: () => canvas.deleteSelection() }, "Delete boxes"),
        h("span", { class: "hint" }, "Shift-click boxes to add or remove them."),
      );
    } else if (selection?.type === "group") {
      const group = getGroup(chart, selection.id);
      const label = h("input", { class: "lane-name-input", value: group.label, placeholder: "No label", "aria-label": "Group label" });
      label.addEventListener("change", () => { group.label = label.value.trim(); canvas.changed(); });
      label.addEventListener("keydown", (e) => { if (e.key === "Enter") label.blur(); });
      items.push(
        h("span", { class: "label" }, "Group"),
        label,
        h("span", { class: "sep" }),
        h("span", { class: "label" }, "Style"),
        GROUP_STYLES.map((st) =>
          h("button", {
            class: `btn${group.style === st.id ? " active" : ""}`,
            "aria-pressed": String(group.style === st.id),
            onclick: () => canvas.setGroupStyle(st.id),
          }, st.name),
        ),
        h("span", { class: "sep" }),
        h("button", { class: "btn danger", title: "Remove the bracket; the boxes stay", onclick: () => canvas.deleteSelection() }, "Ungroup"),
        h("span", { class: "hint" }, `${group.boxes.length} box${group.boxes.length === 1 ? "" : "es"} · Shift-click a box to add it or take it out.`),
      );
    } else if (selection?.type === "item") {
      const item = getItem(chart, selection.id);
      const list = chart.sidebar.sections.find((s) => s.items.includes(item)).items;
      const i = list.indexOf(item);
      items.push(
        h("span", { class: "label" }, "Tracker item"),
        h("button", { class: "btn", onclick: () => canvas.startEdit(item.id) }, "Edit text"),
        h("span", { class: "sep" }),
        h("span", { class: "label" }, "Color"),
        swatches(item.color || "#ffffff", (c) => canvas.setColor(c)),
        h("span", { class: "sep" }),
        h("span", { class: "label" }, "Tick circles"),
        h("button", { class: "btn icon", "aria-label": "Fewer tick circles", title: "Fewer tick circles", disabled: item.count <= 0, onclick: () => canvas.setCount(item.count - 1) }, "−"),
        h("span", { class: "count", "aria-label": "Tick circles" }, String(item.count)),
        h("button", { class: "btn icon", "aria-label": "More tick circles", title: "More tick circles", disabled: item.count >= MAX_COUNT, onclick: () => canvas.setCount(item.count + 1) }, "+"),
        h("span", { class: "sep" }),
        badgeControls(canvas, item),
        h("span", { class: "sep" }),
        h("button", { class: "btn icon", title: "Move item up", "aria-label": "Move item up", disabled: i === 0, onclick: () => canvas.moveItem(-1) }, "↑"),
        h("button", { class: "btn icon", title: "Move item down", "aria-label": "Move item down", disabled: i === list.length - 1, onclick: () => canvas.moveItem(1) }, "↓"),
        h("button", { class: "btn", onclick: () => canvas.addItem() }, "Add item below"),
        h("button", { class: "btn danger", onclick: () => canvas.deleteSelection() }, "Delete item"),
      );
    } else if (selection?.type === "section") {
      const section = getSection(chart, selection.id);
      const i = chart.sidebar.sections.indexOf(section);
      const name = h("input", { class: "lane-name-input", value: section.name, "aria-label": "Section name" });
      name.addEventListener("change", () => {
        if (name.value.trim()) { section.name = name.value.trim(); canvas.changed(); }
      });
      name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); });
      items.push(
        h("span", { class: "label" }, "Section"),
        name,
        h("button", { class: "btn", onclick: () => canvas.addItem() }, "Add item"),
        h("span", { class: "sep" }),
        h("button", { class: "btn icon", title: "Move section up", "aria-label": "Move section up", disabled: i === 0, onclick: () => canvas.moveSection(-1) }, "↑"),
        h("button", { class: "btn icon", title: "Move section down", "aria-label": "Move section down", disabled: i === chart.sidebar.sections.length - 1, onclick: () => canvas.moveSection(1) }, "↓"),
        h("button", { class: "btn", onclick: () => canvas.addSection(section.id) }, "Add section below"),
        h("button", { class: "btn danger", onclick: () => canvas.deleteSelection() }, "Delete section"),
      );
    } else if (selection?.type === "sidebar") {
      items.push(
        h("span", { class: "label" }, "Side column"),
        h("button", { class: "btn", onclick: () => canvas.addSection() }, "Add section"),
        h("button", { class: "btn danger", onclick: () => canvas.setSidebar(false) }, "Remove side column"),
        h("span", { class: "hint" }, "Click a section heading to add items to it. Gear, resources, healing, conditions — anything that isn't part of the turn."),
      );
    } else if (selection?.type === "edge") {
      items.push(
        h("button", { class: "btn", onclick: () => canvas.editEdgeLabel(selection.id) }, "Edit label"),
        h("button", { class: "btn danger", onclick: () => canvas.deleteSelection() }, "Delete arrow"),
      );
    } else {
      items.push(
        chart.sidebar ? null : h("button", { class: "btn", onclick: () => canvas.setSidebar(true) }, "Add side column"),
        h("span", { class: "hint" },
          "Click a lane header to edit it or fill it from the palette · drag cards into a lane · double-click a lane for a blank box · drag from a box's side dots to connect"),
      );
    }
    // Drop placeholders for controls that don't apply (null would render as text).
    toolbar.replaceChildren(...items.flat().filter((el) => el != null));
  }

  function print() {
    buildPrintSheet(document.getElementById("print-sheet"), chartRecord);
    window.print();
  }

  const editorEl = h(
    "div",
    { class: "editor" },
    h(
      "header",
      { class: "topbar" },
      h("a", { class: "btn", href: "#/" }, "← Charts"),
      nameEl,
      h("a", { class: "btn", href: `#/chart/${chartRecord.id}/intro` }, "Edit character"),
      h("span", { class: "spacer" }),
      status,
      h("button", { class: "btn", title: "Zoom out", onclick: () => canvas.zoomBy(1 / 1.2) }, "−"),
      h("button", { class: "btn", title: "Zoom in", onclick: () => canvas.zoomBy(1.2) }, "+"),
      h("button", { class: "btn", onclick: () => canvas.fitView() }, "Fit"),
      h("button", { class: "btn", onclick: () => { dirty = true; save(); } }, "Save"),
      h("button", { class: "btn primary", onclick: print }, "Print"),
    ),
    toolbar,
    h("div", { class: "workspace" }, palette, wrap),
  );
  nameEl.addEventListener("click", rename);
  container.replaceChildren(editorEl);

  const canvas = new Canvas(wrap, chart, {
    onChange: () => { markDirty(); renderToolbar(canvas.selection); },
    onSelect: (sel) => renderToolbar(sel),
  });
  renderPalette(palette, chart.character, (item) => canvas.addCard(item));
  renderToolbar(null);
  requestAnimationFrame(() => canvas.fitView());

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      dirty = true;
      save();
      return;
    }
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      canvas.deleteSelection();
    } else if (e.key === "Escape") {
      // From a badge, Escape goes back to the badge's box (or item or lane).
      canvas.select(canvas.selection?.type === "badge" ? canvas.ownerSelection(canvas.selection.owner) : null);
      canvas.render();
    } else if (e.key === "Enter" && (canvas.selection?.type === "box" || canvas.selection?.type === "item")) {
      e.preventDefault();
      canvas.startEdit(canvas.selection.id);
    }
  }
  function onBeforePrint() {
    buildPrintSheet(document.getElementById("print-sheet"), chartRecord);
  }
  function onBeforeUnload(e) {
    if (dirty) {
      save();
      e.preventDefault();
    }
  }
  document.addEventListener("keydown", onKey);
  window.addEventListener("beforeprint", onBeforePrint);
  window.addEventListener("beforeunload", onBeforeUnload);

  return async () => {
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("beforeprint", onBeforePrint);
    window.removeEventListener("beforeunload", onBeforeUnload);
    canvas.finishEdit(true);
    await save();
  };
}
