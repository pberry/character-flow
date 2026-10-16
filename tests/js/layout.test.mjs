import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutChart, laneAt, layoutBounds, HEADER_W, LANE_PAD, MIN_LANE_H, CONTENT_W, PAGE_W, PAGE_H,
  BOX_MAX_RIGHT, BOX_MIN_X, BOX_MIN_Y, findSlot, endOfLane,
} from "../../app/static/js/layout.js";
import { newChart, addBox } from "../../app/static/js/model.js";
import { badgeOverhang } from "../../app/static/js/badges.js";

test("empty default chart stacks five minimum-height lanes", () => {
  const layout = layoutChart(newChart());
  assert.deepEqual(layout.lanes.map((l) => l.name), ["Start of turn", "Attack", "Bonus Actions", "Reactions", "Other Actions"]);
  assert.deepEqual(layout.lanes.map((l) => l.top), [0, 110, 220, 330, 440].map((n) => (n / 110) * MIN_LANE_H));
  assert.equal(layout.height, 5 * MIN_LANE_H);
  assert.equal(layout.left, -HEADER_W);
  assert.equal(layout.width, PAGE_W);
});

test("lanes grow to fit boxes and push later lanes down", () => {
  const c = newChart();
  addBox(c, { lane: "l2", x: 100, y: 200, h: 70 });
  const layout = layoutChart(c);
  const attack = layout.lanes[1];
  assert.equal(attack.height, 200 + 70 + LANE_PAD);
  assert.equal(layout.lanes[2].top, attack.top + attack.height);
});

test("box positions become absolute", () => {
  const c = newChart();
  const b = addBox(c, { lane: "l3", x: 100, y: 30 });
  const abs = layoutChart(c).boxes.find((x) => x.id === b.id);
  assert.equal(abs.y, 2 * MIN_LANE_H + 30);
  assert.equal(abs.x, 100);
  assert.equal(c.boxes[0].y, 30, "stored box is not mutated");
});

test("width stays at one page however far right boxes are placed", () => {
  const c = newChart();
  addBox(c, { x: 2000, w: 160 });
  assert.equal(layoutChart(c).width, PAGE_W);
  assert.equal(c.boxes[0].x + c.boxes[0].w, BOX_MAX_RIGHT);
});

test("page height matches the printable aspect ratio", () => {
  assert.equal(PAGE_W, HEADER_W + CONTENT_W);
  assert.ok(Math.abs((PAGE_W + 8) / (PAGE_H + 8) - 1.5) < 0.01);
});

const B = (x, y, w = 160, h = 70) => ({ x, y, w, h });

test("findSlot keeps a free spot", () => {
  assert.deepEqual(findSlot([], B(200, 10)), { x: 200, y: 10 });
});

test("findSlot slides right past boxes in the way", () => {
  assert.deepEqual(findSlot([B(20, 10)], B(20, 10)), { x: 220, y: 10 });
});

test("findSlot wraps to a new row at the page edge", () => {
  const row = [20, 220, 420, 620, 820].map((x) => B(x, 10));
  assert.ok(820 + 160 <= BOX_MAX_RIGHT, "five boxes fit in a row");
  assert.deepEqual(findSlot(row, B(20, 10)), { x: BOX_MIN_X, y: 10 + 70 + 30 });
  // Starting right of the last box (e.g. "next to the selected box") wraps too.
  assert.deepEqual(findSlot(row, B(1040, 10)), { x: BOX_MIN_X, y: 110 });
});

test("endOfLane starts empty lanes at the top left", () => {
  assert.deepEqual(endOfLane([], { w: 160, h: 70 }), { x: BOX_MIN_X, y: BOX_MIN_Y });
});

test("endOfLane continues the lowest row, then wraps", () => {
  assert.deepEqual(endOfLane([B(20, 10), B(20, 110)], { w: 160, h: 70 }), { x: 220, y: 110 });
  const full = [20, 220, 420, 620, 820].map((x) => B(x, 10));
  assert.deepEqual(endOfLane(full, { w: 160, h: 70 }), { x: BOX_MIN_X, y: 110 });
});

test("frozen lanes and a floating box don't change lane geometry", () => {
  const c = newChart();
  const b = addBox(c, { lane: "l1", y: 300 });
  const before = layoutChart(c);
  const during = layoutChart(c, { frozen: before.lanes, floating: { id: b.id, x: 500, y: 5 } });
  assert.deepEqual(during.lanes.map((l) => [l.top, l.height]), before.lanes.map((l) => [l.top, l.height]));
  const abs = during.boxes.find((x) => x.id === b.id);
  assert.deepEqual([abs.x, abs.y], [500, 5]);
});

test("boxes with an unknown lane fall into the first lane", () => {
  const c = newChart();
  c.boxes.push({ id: "b9", lane: "zzz", x: 20, y: 10, w: 100, h: 50 });
  assert.equal(layoutChart(c).boxes[0].lane, "l1");
});

test("laneAt clamps above and below", () => {
  const layout = layoutChart(newChart());
  assert.equal(laneAt(layout, -50).id, "l1");
  assert.equal(laneAt(layout, MIN_LANE_H + 1).id, "l2");
  assert.equal(laneAt(layout, 99999).id, "l5");
  assert.equal(laneAt({ lanes: [] }, 0), null);
});

test("layoutBounds covers headers and all lanes", () => {
  const layout = layoutChart(newChart());
  assert.deepEqual(layoutBounds(layout), { x: -HEADER_W, y: 0, w: layout.width, h: layout.height });
});

test("badges hanging below a box make its lane taller", () => {
  const chart = newChart();
  const box = addBox(chart, { lane: "l1", x: 20, y: 10, w: 160, h: 70 });
  const plain = layoutChart(chart).lanes[0].height;
  box.badges = [{ type: "modifier", text: "2x + 9' reach" }];
  const tall = layoutChart(chart).lanes[0].height;
  const over = badgeOverhang(box).bottom;
  assert.ok(over > 20);
  assert.equal(tall, 10 + 70 + over + 20);
  assert.ok(tall > plain);
});

test("badges sticking out past the page edge widen the layout", () => {
  const chart = newChart();
  const box = addBox(chart, { lane: "l1", x: 5000 });
  assert.equal(layoutChart(chart).width, PAGE_W);
  box.badges = [{ type: "recharge", text: "SR" }, { type: "recharge", text: "LR" }];
  assert.ok(layoutChart(chart).width > PAGE_W);
});
