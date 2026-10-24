// The share dialog: a chart's private edit link and its read-only view link.
// The links are the only way back to a chart, so this is shown right after a
// chart is created and from the editor's "Links" button.

import { h } from "./dom.js";

export const editUrl = (editKey) => `${location.origin}/#/edit/${editKey}`;
export const viewUrl = (viewKey) => `${location.origin}/#/view/${viewKey}`;

function linkRow(label, url, note) {
  const input = h("input", { readonly: true, value: url, "aria-label": label, class: "link-input" });
  const copy = h("button", { type: "button", class: "btn" }, "Copy");
  copy.addEventListener("click", async () => {
    input.select();
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = "Copied";
    } catch {
      // Without clipboard access (e.g. plain http on a LAN) the text is selected to copy by hand.
      copy.textContent = "Press Ctrl/Cmd+C";
    }
  });
  return h("div", { class: "link-row" }, h("b", {}, label), h("div", { class: "link-field" }, input, copy), h("p", { class: "muted" }, note));
}

export function showLinksDialog(record, { fresh = false } = {}) {
  const dialog = h(
    "dialog",
    { class: "links-dialog" },
    h("h2", {}, fresh ? "Bookmark your chart" : "Links to this chart"),
    fresh
      ? h("p", { class: "warning" }, "There are no accounts: this link is the only way back to your chart. Bookmark it or keep a copy somewhere safe.")
      : null,
    linkRow("Edit link", editUrl(record.edit_key), "Private. Anyone with it can change or delete the chart."),
    linkRow("View link", viewUrl(record.view_key), "Safe to share with your table. It can be viewed, printed, and copied, never changed."),
    h("form", { method: "dialog" }, h("button", { class: "btn primary" }, "Done")),
  );
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
