import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_STYLES, GROUP_PAD, normalizeGroups, getGroup, addGroup, updateGroup, deleteGroup,
  toggleMember, forgetBox, groupRect, groupPathD,
} from "../../app/static/js/groups.js";
import { newChart, addBox, deleteBox, deleteLane, normalizeChart, defaultLanes } from "../../app/static/js/model.js";

const chartWith = (n) => {
  const c = newChart();
  for (let i = 0; i < n; i++) addBox(c, { x: 20 + i * 200 });
  return c;
};

test("two styles, bracket first", () => {
  assert.deepEqual(GROUP_STYLES.map((s) => s.id), ["bracket", "outline"]);
});

test("addGroup keeps existing, unique boxes and defaults to a bracket", () => {
  const c = chartWith(3);
  const g = addGroup(c, ["b1", "b2", "b2", "nope"]);
  assert.deepEqual(g, { id: "g1", boxes: ["b1", "b2"], label: "", style: "bracket" });
  assert.equal(addGroup(c, ["nope"]), null);
  assert.equal(addGroup(c, ["b3"], { style: "zigzag" }).style, "bracket");
  assert.equal(addGroup(c, ["b3"], { style: "outline", label: "x" }).id, "g3");
});

test("updateGroup sets a trimmed label and known styles only", () => {
  const c = chartWith(1);
  const g = addGroup(c, ["b1"]);
  updateGroup(c, g.id, { label: "  While attuned ", style: "outline" });
  assert.deepEqual([g.label, g.style], ["While attuned", "outline"]);
  updateGroup(c, g.id, { style: "zigzag" });
  assert.equal(g.style, "outline");
  assert.equal(updateGroup(c, "g9", { label: "x" }), null);
});

test("toggleMember adds and removes boxes; an emptied group is deleted", () => {
  const c = chartWith(2);
  const g = addGroup(c, ["b1"]);
  assert.equal(toggleMember(c, g.id, "b2"), true);
  assert.deepEqual(g.boxes, ["b1", "b2"]);
  assert.equal(toggleMember(c, g.id, "b1"), false);
  assert.equal(toggleMember(c, g.id, "nope"), false);
  assert.deepEqual(g.boxes, ["b2"]);
  toggleMember(c, g.id, "b2");
  assert.equal(getGroup(c, g.id), null);
});

test("deleting a box takes it out of groups; deleting all of a group's boxes deletes it", () => {
  const c = chartWith(3);
  addGroup(c, ["b1", "b2"]);
  addGroup(c, ["b3"]);
  deleteBox(c, "b1");
  assert.deepEqual(c.groups.map((g) => g.boxes), [["b2"], ["b3"]]);
  deleteBox(c, "b3");
  assert.deepEqual(c.groups.map((g) => g.id), ["g1"]);
  // Deleting a lane deletes its boxes, and so their groups.
  deleteLane(c, "l1");
  assert.deepEqual(c.groups, []);
  forgetBox(c, "b2");
  deleteGroup(c, "g1");
  assert.deepEqual(c.groups, []);
});

test("normalizeGroups drops unknown boxes, duplicates, and empty groups", () => {
  const groups = normalizeGroups([
    { id: "g1", boxes: ["b1", "b1", "zz"], label: 3, style: "zigzag" },
    { id: "g2", boxes: ["zz"] },
    { boxes: ["b1"] },
    null,
  ], new Set(["b1"]));
  assert.deepEqual(groups, [{ id: "g1", boxes: ["b1"], label: "", style: "bracket" }]);
  assert.deepEqual(normalizeGroups(undefined, new Set()), []);
  const c = normalizeChart({ lanes: defaultLanes(), boxes: [{ id: "b1", lane: "l1", x: 20, y: 10, w: 160, h: 70 }], groups: [{ id: "g1", boxes: ["b1", "b2"] }] });
  assert.deepEqual(c.groups[0].boxes, ["b1"]);
  assert.deepEqual(newChart().groups, []);
});

test("groupRect pads the members' bounding box", () => {
  const boxes = [
    { id: "b1", x: 100, y: 50, w: 160, h: 70 },
    { id: "b2", x: 300, y: 80, w: 100, h: 100 },
    { id: "b3", x: 900, y: 900, w: 10, h: 10 },
  ];
  const r = groupRect({ boxes: ["b1", "b2"] }, boxes);
  assert.deepEqual(r, { x: 100 - GROUP_PAD, y: 50 - GROUP_PAD, w: 300 + 2 * GROUP_PAD, h: 130 + 2 * GROUP_PAD });
  assert.equal(groupRect({ boxes: ["zz"] }, boxes), null);
});

test("a bracket is open on the left; an outline is closed", () => {
  const r = { x: 0, y: 0, w: 200, h: 100 };
  const bracket = groupPathD("bracket", r);
  assert.match(bracket, /^M0 0 /);
  assert.match(bracket, / H0$/);
  assert.doesNotMatch(bracket, /Z$/);
  assert.match(groupPathD("outline", r), /Z$/);
});
