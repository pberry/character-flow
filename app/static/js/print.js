// Builds a print-only copy of the chart scaled to one landscape letter page.

import { h, s } from "./dom.js";
import { boundingBox, fitViewBox } from "./geometry.js";
import { createSvg, drawChart } from "./canvas.js";
import { characterSummary } from "./palette.js";

// Printable area of 11x8.5in with 0.4in margins, minus a 0.7in header and a little slack.
export const PRINT_WIDTH_IN = 10.2;
export const PRINT_HEIGHT_IN = 6.8;

export function buildPrintSheet(sheet, chartRecord) {
  const chart = chartRecord.data;
  const svg = createSvg("pr");
  const g = s("g");
  svg.append(g);
  drawChart(g, chart, { prefix: "pr" });
  const vb = fitViewBox(boundingBox(chart.boxes), PRINT_WIDTH_IN / PRINT_HEIGHT_IN);
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  sheet.replaceChildren(
    h("header", { class: "print-header" }, characterSummary(chart.character), h("div", { class: "print-title" }, chartRecord.name)),
    svg,
  );
}
