// Builds a print-only copy of the chart scaled to one landscape letter page.

import { h, s } from "./dom.js";
import { fitViewBox } from "./geometry.js";
import { PAGE_W, PRINT_PAD, hasNotes, layoutBounds, layoutChart, printAspect } from "./layout.js";
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
  const parts = [
    h("header", { class: "print-header" }, characterSummary(chart.character), h("div", { class: "print-title" }, chartRecord.name)),
    svg,
  ];
  if (notes) parts.push(h("section", { class: "print-notes" }, h("b", {}, "Notes "), chart.character.notes.trim()));
  sheet.replaceChildren(...parts);
}
