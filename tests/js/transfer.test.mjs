import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addBox, addEdge, CHART_VERSION, newChart, normalizeChart } from "../../app/static/js/model.js";
import { FILE_FORMAT, MAX_FILE_BYTES, exportChart, exportFilename, parseChartFile, readChartFile } from "../../app/static/js/transfer.js";

const fixture = () => readFileSync(new URL("./fixtures/chart-v2.json", import.meta.url), "utf8");

function sampleChart() {
  const chart = newChart();
  const a = addBox(chart, { lane: "l1", text: "Rage?" });
  const b = addBox(chart, { lane: "l2", x: 400, text: "Attack" });
  addEdge(chart, { box: a.id, side: "right" }, { box: b.id, side: "left" }, "yes");
  return chart;
}

const record = (data = sampleChart()) => ({
  name: "Brakka", data, edit_key: "secret-edit", view_key: "secret-view", updated_at: "2026-10-31T00:00:00+00:00",
});

const fileText = (overrides = {}) => JSON.stringify({ format: FILE_FORMAT, name: "Brakka", data: sampleChart(), ...overrides });

// A file whose chart data was changed by `edit`.
function damaged(edit) {
  const data = sampleChart();
  edit(data);
  return fileText({ data });
}

test("an exported chart imports unchanged", () => {
  const { text } = exportChart(record());
  const { name, data } = parseChartFile(text);
  assert.equal(name, "Brakka");
  assert.deepEqual(data, normalizeChart(sampleChart()));
});

test("an export holds the chart but neither of its keys", () => {
  const { text } = exportChart(record());
  assert.ok(!text.includes("secret-edit"));
  assert.ok(!text.includes("secret-view"));
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ["data", "exported_at", "format", "name"]);
});

test("an export records the chart's version and the time", () => {
  const file = JSON.parse(exportChart(record(), new Date("2026-10-31T12:00:00Z")).text);
  assert.equal(file.data.version, CHART_VERSION);
  assert.equal(file.exported_at, "2026-10-31T12:00:00.000Z");
});

test("the filename is the chart's name and date, safe for any file system", () => {
  const day = new Date(2026, 9, 31, 12);
  assert.equal(exportFilename("Brakka", day), "Brakka-2026-10-31.json");
  assert.equal(exportFilename("../a/b: c?", day), "a-b-c-2026-10-31.json");
  assert.equal(exportFilename("Méren — tactics", day), "Méren-tactics-2026-10-31.json");
  assert.equal(exportFilename("???", day), "chart-2026-10-31.json");
});

// Breaking change? Don't edit this fixture. It stands for every backup players
// already hold: bump CHART_VERSION and teach parseChartFile to upgrade it.
test("a version 2 backup always imports, with every feature intact", () => {
  const { name, data } = parseChartFile(fixture());
  assert.equal(name, "Brakka — default tactics");
  assert.deepEqual(data, normalizeChart(JSON.parse(fixture()).data));
  assert.equal(data.boxes.length, 2);
  assert.equal(data.edges[0].label, "yes");
  assert.equal(data.groups[0].label, "While raging");
  assert.equal(data.sidebar.sections[0].items[0].count, 3);
  assert.equal(data.lanes[0].badges[0].text, "1");
  assert.equal(data.orientation, "portrait");
});

test("fields added by later releases of the same version are kept", () => {
  const { data } = parseChartFile(damaged((d) => { d.theme = "dark"; d.boxes[0].glow = true; }));
  assert.equal(data.theme, "dark");
  assert.equal(data.boxes[0].glow, true);
});

test("refuses a file that isn't JSON", () => {
  assert.throws(() => parseChartFile('{"format": "character-'), /isn't valid JSON/);
  assert.throws(() => parseChartFile(""), /isn't valid JSON/);
});

test("refuses JSON that isn't a chart file", () => {
  for (const text of ["null", "[]", "3", '"chart"', "{}", '{"format": "something-else"}', '{"name": "A", "data": {}}']) {
    assert.throws(() => parseChartFile(text), /isn't a Character Flow chart file/, text);
  }
});

test("refuses a file without a chart name or chart data", () => {
  assert.throws(() => parseChartFile(fileText({ name: "  " })), /no chart name/);
  assert.throws(() => parseChartFile(fileText({ name: 7 })), /no chart name/);
  assert.throws(() => parseChartFile(fileText({ data: [] })), /no chart data/);
});

test("refuses a file from a newer version and says what to do", () => {
  assert.throws(() => parseChartFile(damaged((d) => { d.version = CHART_VERSION + 1; })), /newer version of Character Flow.*[Rr]eload/);
});

test("refuses a missing or unknown version", () => {
  for (const version of [undefined, null, "2", 1.5, 0, 1]) {
    assert.throws(() => parseChartFile(damaged((d) => { d.version = version; })), /version/, String(version));
  }
});

// Each of these would crash the editor or the print page, or be dropped without
// a word by normalizeChart: not acceptable for someone restoring a backup.
const BREAKAGE = {
  "no lanes list": (d) => { delete d.lanes; },
  "empty lanes": (d) => { d.lanes = []; },
  "a lane that isn't an object": (d) => { d.lanes[0] = null; },
  "a lane without a name": (d) => { delete d.lanes[0].name; },
  "a lane without a color": (d) => { d.lanes[0].color = 3; },
  "two lanes with one id": (d) => { d.lanes[1].id = d.lanes[0].id; },
  "no boxes list": (d) => { d.boxes = "lots"; },
  "a box that isn't an object": (d) => { d.boxes[0] = null; },
  "a box without an id": (d) => { delete d.boxes[0].id; },
  "two boxes with one id": (d) => { d.boxes[1].id = d.boxes[0].id; },
  "a box in a missing lane": (d) => { d.boxes[0].lane = "nope"; },
  "a box without a position": (d) => { delete d.boxes[0].x; },
  "a box positioned with text": (d) => { d.boxes[0].y = "20"; },
  "a box with no size": (d) => { d.boxes[0].w = 0; },
  "a box with text that isn't text": (d) => { d.boxes[0].text = null; },
  "a box without a color": (d) => { delete d.boxes[0].color; },
  "no arrows list": (d) => { delete d.edges; },
  "an arrow that isn't an object": (d) => { d.edges[0] = 1; },
  "an arrow without ends": (d) => { delete d.edges[0].to; },
  "an arrow to a missing box": (d) => { d.edges[0].to.box = "nope"; },
  "an arrow to an unknown side": (d) => { d.edges[0].from.side = "middle"; },
  "no character": (d) => { d.character = null; },
  "a character list that isn't a list": (d) => { d.character.weapons = "axe"; },
  "a weapon that isn't an object": (d) => { d.character.weapons = [null]; },
  "a spell with a numeric name": (d) => { d.character.spells = [{ name: 3 }]; },
  "an ability with no name": (d) => { d.character.abilities[0].name = null; },
  "a side column that isn't an object": (d) => { d.sidebar = "gear"; },
  "groups that aren't a list": (d) => { d.groups = {}; },
};

for (const [label, edit] of Object.entries(BREAKAGE)) {
  test(`refuses a chart with ${label}`, () => {
    assert.throws(() => parseChartFile(damaged(edit)), /damaged/);
  });
}

test("the damage message names what's wrong", () => {
  assert.throws(() => parseChartFile(damaged((d) => { d.boxes[1].x = "far"; })), /box 2/);
  assert.throws(() => parseChartFile(damaged((d) => { d.edges[0].to.box = "nope"; })), /arrow 1/);
});

test("refuses a file too large to be a chart without reading it", async () => {
  const huge = { size: MAX_FILE_BYTES + 1, text: () => assert.fail("read a huge file") };
  await assert.rejects(readChartFile(huge), /too large/);
});

test("reads a chart from a file", async () => {
  const { text } = exportChart(record());
  assert.equal((await readChartFile(new Blob([text]))).name, "Brakka");
});
