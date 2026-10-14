import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newChart, normalizeChart, abilityModifier, formatModifier, addBox, moveBox, resizeBox,
  deleteBox, addEdge, deleteEdge, updateEdge, nextId, paletteGroups, bringToFront, MIN_W,
} from "../../app/static/js/model.js";

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

test("boxes snap to grid and enforce minimum size", () => {
  const c = newChart();
  const b = addBox(c, { x: 13, y: 27 });
  assert.equal(b.x, 10);
  assert.equal(b.y, 30);
  moveBox(c, b.id, 104, 96);
  assert.deepEqual([b.x, b.y], [100, 100]);
  resizeBox(c, b.id, 5, 5);
  assert.equal(b.w, MIN_W);
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
  const sword = groups[1].items[0];
  assert.equal(sword.text, "Longsword\n1d8+3");
  assert.equal(groups[1].items.length, 1);
});
