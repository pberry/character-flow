import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newChart, normalizeChart, abilityModifier, formatModifier, addBox, moveBox, resizeBox,
  deleteBox, addEdge, deleteEdge, updateEdge, nextId, paletteGroups, bringToFront, MIN_W,
  addLane, updateLane, moveLane, deleteLane, boxesInLane, defaultLanes,
} from "../../app/static/js/model.js";
import { BOX_MAX_RIGHT } from "../../app/static/js/layout.js";

test("ability modifiers", () => {
  assert.equal(abilityModifier(10), 0);
  assert.equal(abilityModifier(11), 0);
  assert.equal(abilityModifier(9), -1);
  assert.equal(abilityModifier(18), 4);
  assert.equal(abilityModifier(1), -5);
  assert.equal(abilityModifier("x"), 0);
  assert.equal(formatModifier(3), "+3");
  assert.equal(formatModifier(0), "+0");
  assert.equal(formatModifier(-1), "-1");
});

test("ids increment past existing ones", () => {
  assert.equal(nextId("b", []), "b1");
  assert.equal(nextId("b", [{ id: "b1" }, { id: "b7" }, { id: "e9" }]), "b8");
});

test("boxes snap to grid, stay inside their lane, and enforce minimum size", () => {
  const c = newChart();
  const b = addBox(c, { x: 43, y: 27 });
  assert.equal(b.lane, "l1");
  assert.equal(b.x, 40);
  assert.equal(b.y, 30);
  moveBox(c, b.id, "l3", 104, 96);
  assert.deepEqual([b.lane, b.x, b.y], ["l3", 100, 100]);
  moveBox(c, b.id, "l3", -500, -40);
  assert.deepEqual([b.x, b.y], [20, 10]);
  resizeBox(c, b.id, 5, 5);
  assert.equal(b.w, MIN_W);
});

test("boxes can't move or grow past the page's right edge", () => {
  const c = newChart();
  const b = addBox(c, { x: 5000 });
  assert.equal(b.x + b.w, BOX_MAX_RIGHT);
  moveBox(c, b.id, "l1", 400, 10);
  resizeBox(c, b.id, 5000, 70);
  assert.equal(b.x + b.w, BOX_MAX_RIGHT);
  moveBox(c, b.id, "l1", 5000, 10);
  assert.equal(b.x + b.w, BOX_MAX_RIGHT);
});

test("normalizeChart pulls off-page boxes back onto the page", () => {
  const c = normalizeChart({ boxes: [{ id: "b1", lane: "l1", x: 3000, y: 10, w: 160, h: 70 }] });
  assert.equal(c.boxes[0].x + c.boxes[0].w, BOX_MAX_RIGHT);
});

test("edges reject self loops, duplicates and unknown boxes", () => {
  const c = newChart();
  const a = addBox(c), b = addBox(c, { x: 300 });
  const from = { box: a.id, side: "right" }, to = { box: b.id, side: "left" };
  assert.ok(addEdge(c, from, to));
  assert.equal(addEdge(c, from, to), null);
  assert.equal(addEdge(c, from, { box: a.id, side: "left" }), null);
  assert.equal(addEdge(c, from, { box: "nope", side: "left" }), null);
  assert.equal(c.edges.length, 1);
});

test("deleting a box removes its edges", () => {
  const c = newChart();
  const a = addBox(c), b = addBox(c), d = addBox(c);
  addEdge(c, { box: a.id, side: "right" }, { box: b.id, side: "left" });
  addEdge(c, { box: b.id, side: "right" }, { box: d.id, side: "left" });
  deleteBox(c, a.id);
  assert.equal(c.edges.length, 1);
  assert.equal(c.boxes.length, 2);
});

test("edge label update and delete", () => {
  const c = newChart();
  const a = addBox(c), b = addBox(c);
  const e = addEdge(c, { box: a.id, side: "right" }, { box: b.id, side: "left" });
  updateEdge(c, e.id, { label: "yes" });
  assert.equal(c.edges[0].label, "yes");
  deleteEdge(c, e.id);
  assert.equal(c.edges.length, 0);
});

test("bringToFront moves box to end", () => {
  const c = newChart();
  const a = addBox(c);
  addBox(c);
  bringToFront(c, a.id);
  assert.equal(c.boxes.at(-1).id, a.id);
});

test("normalizeChart fills defaults and drops dangling edges", () => {
  const c = normalizeChart({ boxes: [{ id: "b1" }], edges: [{ from: { box: "b1" }, to: { box: "b9" } }] });
  assert.equal(c.character.abilities.length, 6);
  assert.equal(c.edges.length, 0);
  assert.equal(c.lanes.length, 5);
  assert.equal(c.boxes[0].lane, "l1");
  assert.deepEqual(normalizeChart(null).boxes, []);
});

test("palette groups come from character answers", () => {
  const groups = paletteGroups({
    weapons: [{ name: "Longsword", notes: "1d8+3" }, { name: "  " }],
    spells: [],
    features: [{ name: "Second Wind" }],
  });
  const titles = groups.map((g) => g.title);
  assert.deepEqual(titles, ["Flow", "Weapons", "Features"]);
  assert.equal(groups[0].items.find((i) => i.label === "Blank box").color, null);
  const sword = groups[1].items[0];
  assert.equal(sword.text, "Longsword\n1d8+3");
  assert.equal(groups[1].items.length, 1);
});

test("new charts start with the five default lanes", () => {
  assert.deepEqual(newChart().lanes, defaultLanes());
  assert.deepEqual(defaultLanes().map((l) => l.id), ["l1", "l2", "l3", "l4", "l5"]);
});

test("add, rename, recolor and reorder lanes", () => {
  const c = newChart();
  const lane = addLane(c, "l2", { name: "Movement" });
  assert.equal(lane.id, "l6");
  assert.deepEqual(c.lanes.map((l) => l.id), ["l1", "l2", "l6", "l3", "l4", "l5"]);
  updateLane(c, "l6", { name: "Move", color: "#ffffff" });
  assert.equal(c.lanes[2].name, "Move");
  assert.ok(moveLane(c, "l6", -1));
  assert.deepEqual(c.lanes.slice(0, 3).map((l) => l.id), ["l1", "l6", "l2"]);
  assert.ok(!moveLane(c, "l1", -1));
  assert.ok(!moveLane(c, "l5", 1));
  assert.equal(addLane(c).id, "l7");
  assert.equal(c.lanes.at(-1).id, "l7");
});

test("deleting a lane removes its boxes and their arrows, but never the last lane", () => {
  const c = newChart();
  const a = addBox(c, { lane: "l2" }), b = addBox(c, { lane: "l3" });
  addEdge(c, { box: b.id, side: "top" }, { box: a.id, side: "bottom" });
  assert.ok(deleteLane(c, "l2"));
  assert.equal(c.lanes.length, 4);
  assert.deepEqual(c.boxes.map((x) => x.id), [b.id]);
  assert.equal(c.edges.length, 0);
  assert.equal(boxesInLane(c, "l3").length, 1);
  for (const id of ["l1", "l3", "l4"]) deleteLane(c, id);
  assert.ok(!deleteLane(c, "l5"));
  assert.equal(c.lanes.length, 1);
});
