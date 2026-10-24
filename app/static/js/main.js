// App bootstrap and hash routing: #/ (home), #/edit/<key>/intro, #/edit/<key>,
// #/view/<key>, #/example/<name>. Keys live in the URL fragment, so page loads never send them
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

// Screenshots or a video for the home page, e.g.
//   { src: "/static/media/editor.png", alt: "The editor with Meren's chart", caption: "Build the chart" }
//   { video: "/static/media/demo.mp4", poster: "/static/media/demo.png", alt: "…", caption: "…" }
// The section is hidden while this is empty. Videos loop silently like a GIF, unless the
// player prefers reduced motion. Re-record the demo with `uv run python scripts/record_demo.py`.
const MEDIA = [
  {
    video: "/static/media/demo.mp4",
    poster: "/static/media/demo.png",
    alt: "Building a chart for Sable Quickfingers, a level 5 rogue: filling in the questionnaire, "
      + "then dragging cards into the Start of turn and Attack lanes and connecting them with arrows",
    caption: "Sable the rogue's Sneak Attack checks, from questionnaire to chart in under a minute.",
  },
];

function mediaVideo(m) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const video = h("video", {
    src: m.video, poster: m.poster, controls: true, loop: true, playsinline: true,
    autoplay: !still, preload: still ? "none" : "auto", "aria-label": m.alt,
  });
  // Autoplay needs the muted property; the attribute alone doesn't set it on created elements.
  video.muted = true;
  return video;
}

const SOURCE_URL = "https://github.com/pberry/character-flow";
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
      { class: "page home" },
      h(
        "header",
        { class: "hero" },
        h("h1", { class: "brand" }, "Character Flow"),
        h("p", { class: "tagline" }, "A one-page combat flowchart for ", h("em", {}, "your"), " character, printed and kept at the table."),
        h("p", { class: "lead" },
          "Generic \u201cwhat can I do on my turn?\u201d charts don't fit a real character. Answer a few questions, "
          + "lay out your options turn by turn, and print one sheet you can glance at when it's your go."),
        h("section", { class: "panel start" }, h("h2", {}, "Start a chart"), form,
          h("p", { class: "example" }, "Rather not start from a blank page? ",
            h("a", { href: "#/example/sable" }, "See an example chart for Sable the rogue"),
            ", then make your own copy to edit."),
          error),
      ),
      recentPanel,
      h(
        "section",
        { class: "how" },
        h("h2", {}, "How it works"),
        h(
          "ol",
          { class: "steps" },
          h("li", {}, h("b", {}, "Tell it about your character."),
            " Name, class, level, ability scores, weapons, spells, and features, all as free text. Your answers become a palette of cards."),
          h("li", {}, h("b", {}, "Lay out your turn."),
            " Drag cards into swim lanes (start of turn, attack, bonus actions, reactions, and anything else) and connect them with arrows. "
            + "Add shapes, colors, badges for costs and durations, and a side column for resources and conditions."),
          h("li", {}, h("b", {}, "Print one page."),
            " The chart prints on a single letter sheet, landscape or portrait, in color, with your character summary and notes."),
        ),
      ),
      MEDIA.length
        ? h("section", { class: "media" }, MEDIA.map((m) => h(
          "figure",
          {},
          m.video
            ? mediaVideo(m)
            : h("img", { src: m.src, alt: m.alt, loading: "lazy" }),
          m.caption ? h("figcaption", {}, m.caption) : null,
        )))
        : null,
      h(
        "div",
        { class: "cards" },
        h("section", { class: "panel" }, h("h2", {}, "Who it's for"),
          h("p", {}, "Tabletop RPG players who freeze up when the spotlight lands on them: newer players, anyone with a character "
            + "full of options, or a player coming back after a long break. Game masters can make one with a player or share one with the table."),
          h("p", { class: "muted" }, "It works with any game or edition. It doesn't know the rules, so it never argues with your table's.")),
        h("section", { class: "panel" }, h("h2", {}, "No accounts. Your link is your key."),
          h("p", {}, "Every chart gets two secret links. The ", h("b", {}, "edit link"), " is yours: anyone with it can change the chart, so keep it private. "
            + "The ", h("b", {}, "view link"), " is safe to share: people can look, print, and make their own copy, but never change yours."),
          h("p", { class: "muted" }, "Bookmark your edit link. This browser remembers your charts too, but if you lose the link there's no password to reset.")),
      ),
      h("footer", { class: "site-footer muted" },
        "Character Flow is a free hobby project. ",
        h("a", { href: "/faq" }, "FAQ"), " · ",
        h("a", { href: SOURCE_URL }, "Source on GitHub"), "."),
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

// Example charts ship as static JSON ({name, data}) so they work on any install,
// with no database row behind them. A copy becomes an ordinary new chart.
async function showExamplePage(name) {
  let record;
  try {
    const resp = await fetch(`/static/examples/${name}.json`);
    if (!resp.ok) throw new Error(resp.status === 404 ? "There's no example by that name." : resp.statusText);
    record = await resp.json();
  } catch (err) {
    alert(`Couldn't open the example: ${err.message}`);
    return go("#/");
  }
  record.data = normalizeChart(record.data);
  cleanup = showView(app, record, {
    onCopy: async (copyName) => {
      const chart = await api.createChart(copyName, record.data);
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
  const example = location.hash.match(/^#\/example\/([\w-]+)$/);
  if (example) return showExamplePage(example[1]);
  showHome();
}

window.addEventListener("hashchange", route);
route();
