import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutChart, laneAt, layoutBounds, HEADER_W, LANE_PAD, MIN_LANE_H, MIN_CONTENT_W,
} from "../../app/static/js/layout.js";
import { newChart, addBox } from "../../app/static/js/model.js";

test("empty default chart stacks five minimum-height lanes", () => {
  const layout = layoutChart(newChart());
  assert.deepEqual(layout.lanes.map((l) => l.name), ["Start of turn", "Attack", "Bonus Actions", "Reactions", "Other Actions"]);
  assert.deepEqual(layout.lanes.map((l) => l.top), [0, 110, 220, 330, 440].map((n) => (n / 110) * MIN_LANE_H));
  assert.equal(layout.height, 5 * MIN_LANE_H);
  assert.equal(layout.left, -HEADER_W);
  assert.equal(layout.width, HEADER_W + MIN_CONTENT_W);
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

test("content width grows with the rightmost box", () => {
  const c = newChart();
  addBox(c, { x: 2000, w: 160 });
  assert.equal(layoutChart(c).width, HEADER_W + 2000 + 160 + 60);
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
