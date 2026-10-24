// App bootstrap and hash routing: #/ (home), #/edit/<key>/intro, #/edit/<key>,
// #/view/<key>. Keys live in the URL fragment, so page loads never send them
// to the server.

import * as api from "./api.js";
import { h } from "./dom.js";
import { showEditor } from "./editor.js";
import { renderIntro } from "./intro.js";
import { showLinksDialog } from "./links.js";
import { newChart, normalizeChart } from "./model.js";
import { forgetChart, loadRecent, rememberChart } from "./recent.js";
import { showView } from "./view.js";

const app = document.getElementById("app");
let cleanup = null;
// The chart created in this tab, whose links are shown once the editor opens.
let justCreated = null;

function go(hash) {
  location.hash = hash;
}

function showHome() {
  const error = h("p", { class: "error" });
  const nameInput = h("input", { placeholder: "Chart name, e.g. Brakka — default tactics", required: true, "aria-label": "New chart name" });
  const list = h("ul", { class: "chart-list" });
  const recentPanel = h("section", { class: "panel recent", hidden: true }, h("h2", {}, "Your charts on this browser"), list);

  async function run(action) {
    error.textContent = "";
    try {
      await action();
    } catch (err) {
      error.textContent = err.message;
    }
  }

  // A chart deleted elsewhere (or whose link was reset) is dropped from the list.
  async function act(entry, action) {
    try {
      await action();
    } catch (err) {
      if (err.status !== 404) throw err;
      forgetChart(entry.edit_key);
      throw new Error(`"${entry.name}" no longer exists, so it was removed from this list.`);
    } finally {
      refresh();
    }
  }

  function refresh() {
    const charts = loadRecent();
    recentPanel.hidden = !charts.length;
    list.replaceChildren(
      ...charts.map((c) =>
        h(
          "li",
          {},
          h("a", { class: "chart-link", href: `#/edit/${c.edit_key}` }, c.name),
          h("span", { class: "muted" }, `Updated ${new Date(c.updated_at).toLocaleString()}`),
          h("span", { class: "spacer" }),
          h("button", { class: "btn", onclick: () => run(() => act(c, async () => {
            const name = window.prompt("Rename chart:", c.name);
            if (name && name.trim()) rememberChart(await api.updateChart(c.edit_key, { name: name.trim() }));
          })) }, "Rename"),
          h("button", { class: "btn", onclick: () => run(() => act(c, async () => {
            const name = window.prompt("Name for the copy:", `${c.name} (copy)`);
            if (name && name.trim()) rememberChart(await api.copyChart(c.view_key, name.trim()));
          })) }, "Duplicate"),
          h("button", { class: "btn danger", onclick: () => run(() => act(c, async () => {
            if (!window.confirm(`Delete "${c.name}"? This can't be undone, for you or anyone you've shared it with.`)) return;
            await api.deleteChart(c.edit_key);
            forgetChart(c.edit_key);
          })) }, "Delete"),
        ),
      ),
    );
  }

  const form = h("form", { class: "new-chart" }, nameInput, h("button", { class: "btn primary", type: "submit" }, "Create chart"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      const chart = await api.createChart(nameInput.value.trim(), newChart());
      rememberChart(chart);
      justCreated = chart.edit_key;
      go(`#/edit/${chart.edit_key}/intro`);
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
      recentPanel,
    ),
  );
  refresh();
}

async function showChart(key, intro) {
  let record;
  try {
    record = await api.getChart(key);
  } catch (err) {
    if (err.status === 404) forgetChart(key);
    alert(err.status === 404 ? "That chart link doesn't work. The chart may have been deleted." : `Couldn't open chart: ${err.message}`);
    return go("#/");
  }
  rememberChart(record);
  record.data = normalizeChart(record.data);

  if (intro) {
    renderIntro(app, record, {
      onSave: async (character) => {
        record.data.character = character;
        await api.updateChart(key, { data: record.data });
        go(`#/edit/${key}`);
      },
      onCancel: () => go(`#/edit/${key}`),
    });
    return;
  }
  cleanup = showEditor(app, record);
  if (justCreated === key) {
    justCreated = null;
    showLinksDialog(record, { fresh: true });
  }
}

async function showViewPage(key) {
  let record;
  try {
    record = await api.viewChart(key);
  } catch (err) {
    alert(err.status === 404 ? "That chart link doesn't work. The chart may have been deleted." : `Couldn't open chart: ${err.message}`);
    return go("#/");
  }
  record.data = normalizeChart(record.data);
  cleanup = showView(app, record, {
    onCopy: async (name) => {
      const chart = await api.copyChart(key, name);
      rememberChart(chart);
      justCreated = chart.edit_key;
      go(`#/edit/${chart.edit_key}`);
    },
  });
}

async function route() {
  const previous = cleanup;
  cleanup = null;
  if (previous) await previous();

  const edit = location.hash.match(/^#\/edit\/([\w-]+)(\/intro)?$/);
  if (edit) return showChart(edit[1], Boolean(edit[2]));
  const view = location.hash.match(/^#\/view\/([\w-]+)$/);
  if (view) return showViewPage(view[1]);
  showHome();
}

window.addEventListener("hashchange", route);
route();
