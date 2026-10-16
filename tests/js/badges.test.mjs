import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGE_TYPES, badgeType, badgeSize, badgePathD, layoutBadges, wrapText } from "../../app/static/js/badges.js";
import { nearestOutlinePoint, shapePoints } from "../../app/static/js/shapes.js";

const box = (badges, shape = "rect", w = 160, h = 70) => ({ x: 0, y: 0, w, h, shape, badges });

test("four badge types, each on its own corner", () => {
  assert.deepEqual(BADGE_TYPES.map((t) => t.id), ["cost", "duration", "recharge", "modifier"]);
  const corners = BADGE_TYPES.map((t) => t.corner.join());
  assert.equal(new Set(corners).size, 4);
  assert.equal(badgeType("nope"), null);
});

test("badges keep a readable minimum size and grow with their text", () => {
  const small = badgeSize("cost", "1");
  assert.deepEqual([small.w, small.h], [30, 30]);
  assert.ok(badgeSize("cost", "10 FP each").w > 30);
  const pill = badgeSize("duration", "1 hr");
  assert.ok(pill.w > pill.h, "duration is a pill, wider than tall");
  const plus = badgeSize("recharge", "LR");
  assert.equal(plus.w, plus.h);
  const tri = badgeSize("modifier", "2x");
  assert.ok(tri.h < tri.w);
  assert.ok(badgeSize("modifier", "2x + 9' reach").w > tri.w);
});

test("every badge type has a closed outline", () => {
  for (const { id } of BADGE_TYPES) {
    const { w, h } = badgeSize(id, "LR");
    assert.match(badgePathD(id, w, h), /^M.*Z$/, id);
  }
});

test("long badge text wraps at spaces into short lines", () => {
  assert.deepEqual(wrapText("2x + 9' reach"), ["2x + 9'", "reach"]);
  assert.deepEqual(wrapText("1 FP"), ["1 FP"]);
  assert.deepEqual(wrapText("  "), [""]);
  assert.deepEqual(wrapText("Superlongword x"), ["Superlongword", "x"]);
  const tri = badgeSize("modifier", "2x + 9' reach");
  assert.deepEqual(tri.lines, ["2x + 9'", "reach"]);
  assert.ok(tri.w < 100, `wrapped triangle stays compact (${tri.w})`);
});

test("only the triangle's text sits low", () => {
  assert.ok(badgeSize("modifier", "2x").textY > 0);
  assert.equal(badgeSize("cost", "1 FP").textY, 0);
  // The triangle's text block ends above its base.
  const t = badgeSize("modifier", "2x + 9' reach");
  assert.ok(t.textY + (t.lines.length * 13) / 2 <= t.h / 2 - 3);
});

test("badges sit on their type's corner of a rectangle", () => {
  const placed = layoutBadges(box([
    { type: "cost", text: "1 FP" },
    { type: "duration", text: "1 hr" },
    { type: "recharge", text: "LR" },
    { type: "modifier", text: "2x" },
  ]));
  const at = Object.fromEntries(placed.map((b) => [b.type, [b.x, b.y]]));
  assert.deepEqual(at, { cost: [160, 0], duration: [0, 0], recharge: [160, 70], modifier: [0, 70] });
  assert.deepEqual(placed.map((b) => b.index), [0, 1, 2, 3]);
});

test("badges of the same type line up outward from the corner", () => {
  const placed = layoutBadges(box([
    { type: "recharge", text: "SR" },
    { type: "recharge", text: "LR" },
    { type: "duration", text: "1 hr" },
    { type: "duration", text: "10 min" },
  ]));
  const [sr, lr, hr, min] = placed;
  assert.equal(sr.x, 160);
  assert.equal(lr.x, 160 + sr.w / 2 + 4 + lr.w / 2);
  assert.equal(lr.y, sr.y);
  assert.equal(hr.x, 0);
  assert.ok(min.x < hr.x - hr.w / 2, "left-corner badges stack leftward");
});

test("on shaped boxes, badges sit on the outline point nearest their corner", () => {
  const [b] = layoutBadges(box([{ type: "cost", text: "1 FP" }], "diamond", 160, 90));
  assert.deepEqual({ x: b.x, y: b.y }, nearestOutlinePoint("diamond", 160, 90, 160, 0));
  // On a star the top badges go to the arm tips, not next to the top point.
  const star = shapePoints("star", 160, 140);
  const [dur, cost] = layoutBadges(box([{ type: "duration", text: "10 min" }, { type: "cost", text: "1 FP" }], "star", 160, 140));
  const leftArm = star.reduce((a, p) => (p.x < a.x ? p : a));
  const rightArm = star.reduce((a, p) => (p.x > a.x ? p : a));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(dist(dur, leftArm) < 10, "duration at the left arm tip");
  assert.ok(dist(cost, rightArm) < 10, "cost at the right arm tip");
});

test("nearestOutlinePoint of a rectangle corner is the corner", () => {
  assert.deepEqual(nearestOutlinePoint("rect", 100, 50, 0, 50), { x: 0, y: 50 });
  assert.deepEqual(nearestOutlinePoint("rect", 100, 50, 130, -20), { x: 100, y: 0 });
});

test("unknown badge types are skipped but keep indexes stable", () => {
  const placed = layoutBadges(box([{ type: "bogus", text: "?" }, { type: "cost", text: "1" }]));
  assert.deepEqual(placed.map((b) => b.index), [1]);
  assert.deepEqual(layoutBadges(box(undefined)), []);
});
