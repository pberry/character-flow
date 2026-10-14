// Builds a print-only copy of the chart scaled to one landscape letter page.

import { h, s } from "./dom.js";
import { fitViewBox } from "./geometry.js";
import { layoutBounds, layoutChart } from "./layout.js";
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
  const layout = layoutChart(chart);
  drawChart(g, chart, layout, { prefix: "pr" });
  const vb = fitViewBox(layoutBounds(layout), PRINT_WIDTH_IN / PRINT_HEIGHT_IN, { padding: 4 });
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  sheet.replaceChildren(
    h("header", { class: "print-header" }, characterSummary(chart.character), h("div", { class: "print-title" }, chartRecord.name)),
    svg,
  );
}
