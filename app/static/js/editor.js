// The flowchart editor screen: top bar, selection toolbar, palette and canvas.

import * as api from "./api.js";
import { Canvas } from "./canvas.js";
import { h } from "./dom.js";
import { COLORS } from "./model.js";
import { renderPalette } from "./palette.js";
import { buildPrintSheet } from "./print.js";

const AUTOSAVE_MS = 2000;

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
        COLORS.map((c) =>
          h("button", {
            class: `swatch${box?.color === c.value ? " active" : ""}`,
            title: c.name,
            "aria-label": c.name,
            style: { background: c.value },
            onclick: () => canvas.setColor(c.value),
          }),
        ),
        h("span", { class: "sep" }),
        h("button", { class: "btn", onclick: () => canvas.startEdit(selection.id) }, "Edit text"),
        h("button", { class: "btn danger", onclick: () => canvas.deleteSelection() }, "Delete box"),
        h("span", { class: "hint" }, "Faint dashed arrows are suggestions — click one to keep it."),
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
        COLORS.map((c) =>
          h("button", {
            class: `swatch${lane.color === c.value ? " active" : ""}`,
            title: c.name,
            "aria-label": c.name,
            style: { background: c.value },
            onclick: () => canvas.setColor(c.value),
          }),
        ),
        h("span", { class: "sep" }),
        h("button", { class: "btn icon", title: "Move lane up", "aria-label": "Move lane up", disabled: i === 0, onclick: () => canvas.moveLane(-1) }, "↑"),
        h("button", { class: "btn icon", title: "Move lane down", "aria-label": "Move lane down", disabled: i === chart.lanes.length - 1, onclick: () => canvas.moveLane(1) }, "↓"),
        h("button", { class: "btn", onclick: () => canvas.addLane(lane.id) }, "Add lane below"),
        h("button", { class: "btn danger", disabled: chart.lanes.length <= 1, onclick: () => canvas.deleteSelection() }, "Delete lane"),
        h("span", { class: "hint" }, "Click palette cards to add them to this lane."),
      );
    } else if (selection?.type === "edge") {
      items.push(
        h("button", { class: "btn", onclick: () => canvas.editEdgeLabel(selection.id) }, "Edit label"),
        h("button", { class: "btn danger", onclick: () => canvas.deleteSelection() }, "Delete arrow"),
      );
    } else {
      items.push(
        h("span", { class: "hint" },
          "Click a lane header to edit it or fill it from the palette · drag cards into a lane · double-click a lane for a blank box · drag from a box's side dots to connect"),
      );
    }
    toolbar.replaceChildren(...items.flat());
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
      canvas.select(null);
      canvas.render();
    } else if (e.key === "Enter" && canvas.selection?.type === "box") {
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
