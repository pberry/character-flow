// Read-only page for a view link: the chart as it prints, with Print and
// "Make a copy". It draws with the print code rather than the editor, so there
// are no editing paths to lock down.

import { h } from "./dom.js";
import { buildPrintSheet } from "./print.js";

export function showView(container, record, { onCopy }) {
  const error = h("p", { class: "error" });
  const sheet = h("div", { class: "view-sheet" });

  async function copy() {
    const name = window.prompt("Name for your copy:", `${record.name} (copy)`);
    if (!name || !name.trim()) return;
    try {
      await onCopy(name.trim());
    } catch (err) {
      error.textContent = err.message;
    }
  }

  function print() {
    buildPrintSheet(document.getElementById("print-sheet"), record);
    window.print();
  }

  container.replaceChildren(
    h(
      "div",
      { class: "viewer" },
      h(
        "header",
        { class: "topbar" },
        h("a", { class: "btn", href: "#/" }, "← Home"),
        h("h1", { class: "chart-name" }, record.name),
        h("span", { class: "muted" }, "View only"),
        h("span", { class: "spacer" }),
        h("button", { class: "btn", title: "Make your own editable copy of this chart", onclick: copy }, "Make a copy"),
        h("button", { class: "btn primary", onclick: print }, "Print"),
      ),
      error,
      sheet,
    ),
  );
  buildPrintSheet(sheet, record);

  function onBeforePrint() {
    buildPrintSheet(document.getElementById("print-sheet"), record);
  }
  window.addEventListener("beforeprint", onBeforePrint);
  return () => window.removeEventListener("beforeprint", onBeforePrint);
}
