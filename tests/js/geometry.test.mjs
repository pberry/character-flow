import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anchor, nearestSide, boxAt, routePoints, simplify, polylineMidpoint,
  edgePoints, suggestEdges, segmentHitsBox, boundingBox, fitViewBox, pathD,
} from "../../app/static/js/geometry.js";

const box = (id, x, y, w = 100, h = 50) => ({ id, x, y, w, h });

test("anchors are side midpoints", () => {
  const b = box("a", 10, 20);
  assert.deepEqual(anchor(b, "top"), { x: 60, y: 20 });
  assert.deepEqual(anchor(b, "right"), { x: 110, y: 45 });
  assert.deepEqual(anchor(b, "bottom"), { x: 60, y: 70 });
  assert.deepEqual(anchor(b, "left"), { x: 10, y: 45 });
  assert.throws(() => anchor(b, "corner"));
});

test("nearestSide picks the closest midpoint", () => {
  const b = box("a", 0, 0);
  assert.equal(nearestSide(b, { x: 95, y: 25 }), "right");
  assert.equal(nearestSide(b, { x: 50, y: 48 }), "bottom");
  assert.equal(nearestSide(b, { x: -40, y: 20 }), "left");
});

test("boxAt prefers topmost box", () => {
  const boxes = [box("a", 0, 0), box("b", 50, 0)];
  assert.equal(boxAt(boxes, { x: 60, y: 10 }).id, "b");
  assert.equal(boxAt(boxes, { x: 10, y: 10 }).id, "a");
  assert.equal(boxAt(boxes, { x: 500, y: 10 }), null);
});

test("route between right and left anchors is orthogonal and starts/ends at anchors", () => {
  const p1 = { x: 100, y: 25 }, p2 = { x: 300, y: 125 };
  const pts = routePoints(p1, "right", p2, "left");
  assert.deepEqual(pts[0], p1);
  assert.deepEqual(pts.at(-1), p2);
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y, "segment not orthogonal");
  }
});

test("straight route collapses to a line", () => {
  const pts = routePoints({ x: 100, y: 25 }, "right", { x: 300, y: 25 }, "left");
  assert.deepEqual(pts, [{ x: 100, y: 25 }, { x: 300, y: 25 }]);
  assert.equal(pathD(pts), "M100 25 L300 25");
});

test("mixed horizontal/vertical routes are orthogonal", () => {
  for (const [s1, s2] of [["right", "top"], ["bottom", "left"], ["bottom", "top"]]) {
    const pts = routePoints({ x: 0, y: 0 }, s1, { x: 200, y: 200 }, s2);
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y);
    }
  }
});

test("simplify removes duplicates and collinear points", () => {
  const pts = simplify([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
  assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
});

test("polyline midpoint", () => {
  assert.deepEqual(polylineMidpoint([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]), { x: 10, y: 0 });
});

test("edge points follow a moved box", () => {
  const boxes = [box("a", 0, 0), box("b", 300, 0)];
  const edge = { from: { box: "a", side: "right" }, to: { box: "b", side: "left" } };
  assert.deepEqual(edgePoints(boxes, edge).at(-1), { x: 300, y: 25 });
  boxes[1].y = 200;
  assert.deepEqual(edgePoints(boxes, edge).at(-1), { x: 300, y: 225 });
  assert.equal(edgePoints([boxes[0]], edge), null);
});

test("suggestions prefer near rightward neighbours and skip connected boxes", () => {
  const boxes = [box("sel", 0, 100), box("near", 200, 100), box("far", 500, 100), box("off", 200, 400)];
  let s = suggestEdges(boxes, [], "sel");
  assert.deepEqual(s[0], { from: { box: "sel", side: "right" }, to: { box: "near", side: "left" } });
  assert.ok(s.length <= 3);

  const edges = [{ from: { box: "near", side: "right" }, to: { box: "sel", side: "left" } }];
  s = suggestEdges(boxes, edges, "sel");
  assert.ok(!s.some((x) => x.to.box === "near" || x.from.box === "near"));
});

test("boxes to the left suggest an incoming arrow; stacked boxes suggest vertical", () => {
  const boxes = [box("sel", 300, 0), box("left", 100, 0), box("below", 300, 120)];
  const s = suggestEdges(boxes, [], "sel");
  assert.ok(s.some((x) => x.from.box === "left" && x.from.side === "right" && x.to.side === "left"));
  assert.ok(s.some((x) => x.to.box === "below" && x.from.side === "bottom" && x.to.side === "top"));
});

test("no suggestions without a valid selection", () => {
  assert.deepEqual(suggestEdges([box("a", 0, 0)], [], "missing"), []);
});

test("bounding box and fitViewBox match page aspect", () => {
  const bb = boundingBox([box("a", 0, 0), box("b", 1900, 300)]);
  assert.deepEqual(bb, { x: 0, y: 0, w: 2000, h: 350 });
  const vb = fitViewBox(bb, 11 / 8.5, { padding: 20 });
  assert.ok(Math.abs(vb.w / vb.h - 11 / 8.5) < 1e-9);
  assert.ok(vb.w >= bb.w + 40 && vb.h >= bb.h + 40);
  assert.equal(vb.x, -20);
  assert.equal(boundingBox([]), null);
});

test("fitViewBox doesn't blow up tiny charts", () => {
  const vb = fitViewBox({ x: 0, y: 0, w: 100, h: 50 }, 2, { minWidth: 900 });
  assert.equal(vb.w, 900);
  assert.equal(vb.h, 450);
});

test("suggestions skip routes that pass through another box", () => {
  const boxes = [box("sel", 0, 0), box("mid", 200, 0), box("far", 400, 0)];
  const s = suggestEdges(boxes, [], "sel");
  assert.deepEqual(s.map((x) => x.to.box), ["mid"]);
});

test("segmentHitsBox", () => {
  const b = box("a", 100, 0);
  assert.ok(segmentHitsBox({ x: 0, y: 25 }, { x: 300, y: 25 }, b));
  assert.ok(!segmentHitsBox({ x: 0, y: 80 }, { x: 300, y: 80 }, b));
  assert.ok(!segmentHitsBox({ x: 0, y: 25 }, { x: 100, y: 25 }, b), "touching the edge is fine");
});
