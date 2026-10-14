// App bootstrap and hash routing: #/ (chart list), #/chart/<id>/intro, #/chart/<id>.

import * as api from "./api.js";
import { h } from "./dom.js";
import { showEditor } from "./editor.js";
import { renderIntro } from "./intro.js";
import { newChart, normalizeChart } from "./model.js";

const app = document.getElementById("app");
let cleanup = null;

function go(hash) {
  location.hash = hash;
}

async function showList() {
  const error = h("p", { class: "error" });
  const nameInput = h("input", { placeholder: "Chart name, e.g. Brakka — default tactics", required: true, "aria-label": "New chart name" });
  const list = h("ul", { class: "chart-list" });

  async function run(action) {
    error.textContent = "";
    try {
      await action();
    } catch (err) {
      error.textContent = err.message;
    }
  }

  async function refresh() {
    const charts = await api.listCharts();
    if (!charts.length) {
      list.replaceChildren(h("li", { class: "empty" }, "No charts yet. Create one above to get started."));
      return;
    }
    list.replaceChildren(
      ...charts.map((c) =>
        h(
          "li",
          {},
          h("a", { class: "chart-link", href: `#/chart/${c.id}` }, c.name),
          h("span", { class: "muted" }, `Updated ${new Date(c.updated_at).toLocaleString()}`),
          h("span", { class: "spacer" }),
          h("button", { class: "btn", onclick: () => run(async () => {
            const name = window.prompt("Rename chart:", c.name);
            if (name && name.trim()) { await api.updateChart(c.id, { name: name.trim() }); await refresh(); }
          }) }, "Rename"),
          h("button", { class: "btn", onclick: () => run(async () => {
            const name = window.prompt("Name for the copy:", `${c.name} (copy)`);
            if (name && name.trim()) { await api.copyChart(c.id, name.trim()); await refresh(); }
          }) }, "Duplicate"),
          h("button", { class: "btn danger", onclick: () => run(async () => {
            if (window.confirm(`Delete "${c.name}"? This can't be undone.`)) { await api.deleteChart(c.id); await refresh(); }
          }) }, "Delete"),
        ),
      ),
    );
  }

  const form = h("form", { class: "new-chart" }, nameInput, h("button", { class: "btn primary", type: "submit" }, "Create chart"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      const chart = await api.createChart(nameInput.value.trim(), newChart());
      go(`#/chart/${chart.id}/intro`);
    });
  });

  app.replaceChildren(
    h(
      "div",
      { class: "page" },
      h("h1", { class: "brand" }, "Character Flow"),
      h("p", { class: "lead" }, "Build a turn-by-turn combat flowchart for your character."),
      h("section", { class: "panel" }, h("h2", {}, "New chart"), form),
      error,
      h("section", { class: "panel" }, h("h2", {}, "Your charts"), list),
    ),
  );
  await run(refresh);
}

async function route() {
  const previous = cleanup;
  cleanup = null;
  if (previous) await previous();

  const m = location.hash.match(/^#\/chart\/(\d+)(\/intro)?$/);
  if (!m) return showList();

  let record;
  try {
    record = await api.getChart(m[1]);
  } catch (err) {
    alert(`Couldn't open chart: ${err.message}`);
    return go("#/");
  }
  record.data = normalizeChart(record.data);

  if (m[2]) {
    renderIntro(app, record, {
      onSave: async (character) => {
        record.data.character = character;
        await api.updateChart(record.id, { data: record.data });
        go(`#/chart/${record.id}`);
      },
      onCancel: () => go(`#/chart/${record.id}`),
    });
  } else {
    cleanup = showEditor(app, record);
  }
}

window.addEventListener("hashchange", route);
route();
