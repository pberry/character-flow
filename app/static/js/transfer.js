// Export and import: one chart as one JSON file, so players can keep their own
// backups. A file holds the chart's name and data and never its keys, since
// files get passed around. Importing always makes a new chart with new links.
//
// `data.version` (CHART_VERSION) is the file's only version number. Adding an
// optional field needs no bump: unknown fields are kept, and normalizeChart fills
// in missing ones. A breaking change bumps it, and must keep old files importing:
// upgrade them here, before they're checked.

import { CHART_VERSION, normalizeChart } from "./model.js";
import { SIDES } from "./geometry.js";

export const FILE_FORMAT = "character-flow-chart";
// Far above the server's 128 KiB limit on a chart, which applies to the chart
// without the file's indentation. This only keeps a wrong file from being read.
export const MAX_FILE_BYTES = 1024 * 1024;

const DAMAGED = "This chart file is damaged";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string";

function check(ok, problem) {
  if (!ok) throw new Error(`${DAMAGED}: ${problem}.`);
}

function checkList(list, label, checkItem) {
  check(Array.isArray(list), `its ${label} list is missing`);
  list.forEach((item, i) => {
    const name = `${label} ${i + 1}`;
    check(isObject(item), `${name} is unreadable`);
    checkItem(item, name);
  });
}

function checkUnique(items, label) {
  check(new Set(items.map((i) => i.id)).size === items.length, `its ${label} ids are repeated`);
}

function checkCharacter(character) {
  check(isObject(character), "its character is missing");
  for (const [key, label] of [["abilities", "ability"], ["weapons", "weapon"], ["spells", "spell"], ["features", "feature"]]) {
    checkList(character[key], label, (item, name) => check(isText(item.name), `${name} has no name`));
  }
}

function checkLanes(lanes) {
  checkList(lanes, "lane", (lane, name) => {
    check(isText(lane.id) && isText(lane.name) && isText(lane.color), `${name} is incomplete`);
  });
  check(lanes.length > 0, "it has no lanes");
  checkUnique(lanes, "lane");
}

function checkBoxes(boxes, lanes) {
  const laneIds = new Set(lanes.map((l) => l.id));
  checkList(boxes, "box", (box, name) => {
    check(isText(box.id), `${name} has no id`);
    check(laneIds.has(box.lane), `${name} is in a lane that doesn't exist`);
    check(Number.isFinite(box.x) && Number.isFinite(box.y), `${name} has no position`);
    check(box.w > 0 && box.h > 0 && Number.isFinite(box.w) && Number.isFinite(box.h), `${name} has no size`);
    check(isText(box.text) && isText(box.color), `${name} is incomplete`);
  });
  checkUnique(boxes, "box");
}

function checkEdges(edges, boxes) {
  const boxIds = new Set(boxes.map((b) => b.id));
  const end = (e) => isObject(e) && boxIds.has(e.box) && SIDES.includes(e.side);
  checkList(edges, "arrow", (edge, name) => check(end(edge.from) && end(edge.to), `${name} doesn't join two boxes`));
}

// Checks what normalizeChart can't repair (it would crash) or would repair by
// dropping content without saying so. All of a file imports, or none of it.
function checkChart(data) {
  checkCharacter(data.character);
  checkLanes(data.lanes);
  checkBoxes(data.boxes, data.lanes);
  checkEdges(data.edges, data.boxes);
  check(data.sidebar == null || isObject(data.sidebar), "its side column is unreadable");
  check(data.groups === undefined || Array.isArray(data.groups), "its groups are unreadable");
}

function checkVersion(version) {
  if (version > CHART_VERSION) {
    throw new Error("This file was made by a newer version of Character Flow. Reload this page and try again.");
  }
  check(version === CHART_VERSION, "it has an unknown chart version");
}

// The { name, data } in a chart file's text, or an Error that can be shown to the player.
export function parseChartFile(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON, so it may be damaged or incomplete.");
  }
  if (!isObject(file) || file.format !== FILE_FORMAT) throw new Error("This isn't a Character Flow chart file.");
  check(isText(file.name) && file.name.trim(), "it has no chart name");
  check(isObject(file.data), "it has no chart data");
  checkVersion(file.data.version);
  checkChart(file.data);
  return { name: file.name.trim(), data: normalizeChart(file.data) };
}

export async function readChartFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error("This file is too large to be a chart.");
  return parseChartFile(await file.text());
}

// en-CA writes dates as YYYY-MM-DD, in the player's own time zone.
export function exportFilename(name, now = new Date()) {
  const safe = name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "chart";
  return `${safe}-${now.toLocaleDateString("en-CA")}.json`;
}

export function exportChart({ name, data }, now = new Date()) {
  const file = { format: FILE_FORMAT, exported_at: now.toISOString(), name, data };
  return { filename: exportFilename(name, now), text: `${JSON.stringify(file, null, 2)}\n` };
}

// Downloads what's on screen, including changes that haven't autosaved yet.
export function downloadChart(record) {
  const { filename, text } = exportChart(record);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
