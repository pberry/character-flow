// Builds a print-only copy of the chart scaled to one letter page, in the
// chart's print orientation.

import { h, s } from "./dom.js";
import { fitViewBox } from "./geometry.js";
import { PAGE_W, PRINT_PAD, hasNotes, layoutBounds, layoutChart, orientation, printAspect } from "./layout.js";
import { createSvg, drawChart } from "./canvas.js";
import { characterSummary } from "./palette.js";


export function buildPrintSheet(sheet, chartRecord) {
  const chart = chartRecord.data;
  const svg = createSvg("pr");
  const g = s("g");
  svg.append(g);
  const layout = layoutChart(chart);
  drawChart(g, chart, layout, { prefix: "pr" });
  // Always at least a full page wide, so every chart prints at the same scale
  // unless its lanes run past the bottom of the page. Notes make the chart area shorter.
  const vb = fitViewBox(layoutBounds(layout), printAspect(chart), { padding: PRINT_PAD, minWidth: PAGE_W + 2 * PRINT_PAD });
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const notes = hasNotes(chart);
  sheet.classList.toggle("with-notes", notes);
  const portrait = orientation(chart) === "portrait";
  sheet.classList.toggle("portrait", portrait);
  setPageSize(portrait ? "portrait" : "landscape");
  const parts = [
    h("header", { class: "print-header" }, characterSummary(chart.character), h("div", { class: "print-title" }, chartRecord.name)),
    svg,
  ];
  if (notes) parts.push(h("section", { class: "print-notes" }, h("b", {}, "Notes "), chart.character.notes.trim()));
  sheet.replaceChildren(...parts);
}

// The @page size can't follow a class, so it lives in its own style element.
function setPageSize(orient) {
  let style = document.getElementById("print-page-size");
  if (!style) {
    style = h("style", { id: "print-page-size", media: "print" });
    document.head.append(style);
  }
  style.textContent = `@page { size: letter ${orient}; }`;
}
