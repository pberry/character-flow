import { test } from "node:test";
import assert from "node:assert/strict";
import { SHAPES, isShape, minSize, shapePoints, shapePathD, textArea, outlineAnchor } from "../../app/static/js/shapes.js";
import { anchor } from "../../app/static/js/geometry.js";

const near = (p, q, msg) => {
  assert.ok(Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01, `${msg}: ${JSON.stringify(p)} vs ${JSON.stringify(q)}`);
};

test("shape list has the rectangle first and known ids only", () => {
  assert.equal(SHAPES[0].id, "rect");
  assert.deepEqual(SHAPES.map((s) => s.id), ["rect", "flag", "diamond", "star", "document", "arrow-right", "arrow-up"]);
  assert.ok(isShape("star"));
  assert.ok(!isShape("hexagon"));
  assert.ok(!isShape(undefined));
});

test("rectangle has no polygon and anchors at side midpoints", () => {
  assert.equal(shapePoints("rect", 100, 50), null);
  assert.equal(shapePathD("rect", 100, 50), null);
  assert.deepEqual(outlineAnchor("rect", 100, 50, "left"), { x: 0, y: 25 });
  assert.deepEqual(textArea("rect", 100, 50), { x: 0, y: 0, w: 100, h: 50 });
});

test("every outline stays inside its box", () => {
  for (const { id } of SHAPES) {
    for (const p of shapePoints(id, 160, 90) || []) {
      assert.ok(p.x >= -1e-9 && p.x <= 160 + 1e-9 && p.y >= -1e-9 && p.y <= 90 + 1e-9, `${id} ${JSON.stringify(p)}`);
    }
  }
});

test("every text area stays inside its box", () => {
  for (const { id } of SHAPES) {
    const a = textArea(id, 160, 90);
    assert.ok(a.x >= 0 && a.y >= 0 && a.w > 0 && a.h > 0, id);
    assert.ok(a.x + a.w <= 160 + 1e-9 && a.y + a.h <= 90 + 1e-9, id);
  }
});

test("diamond anchors are its corners", () => {
  near(outlineAnchor("diamond", 100, 60, "top"), { x: 50, y: 0 }, "top");
  near(outlineAnchor("diamond", 100, 60, "right"), { x: 100, y: 30 }, "right");
  near(outlineAnchor("diamond", 100, 60, "bottom"), { x: 50, y: 60 }, "bottom");
  near(outlineAnchor("diamond", 100, 60, "left"), { x: 0, y: 30 }, "left");
});

test("arrow anchors: tip in front, shaft on the sides", () => {
  near(outlineAnchor("arrow-right", 180, 80, "right"), { x: 180, y: 40 }, "right tip");
  near(outlineAnchor("arrow-right", 180, 80, "top"), { x: 90, y: 16 }, "right shaft top");
  near(outlineAnchor("arrow-right", 180, 80, "left"), { x: 0, y: 40 }, "right tail");
  near(outlineAnchor("arrow-up", 140, 130, "top"), { x: 70, y: 0 }, "up tip");
  near(outlineAnchor("arrow-up", 140, 130, "left"), { x: 28, y: 65 }, "up shaft left");
});

test("star anchors land on the outline, inside the box", () => {
  near(outlineAnchor("star", 160, 140, "top"), { x: 80, y: 0 }, "top point");
  for (const side of ["right", "bottom", "left"]) {
    const p = outlineAnchor("star", 160, 140, side);
    assert.ok(p.x > 0 && p.x < 160 && p.y > 0 && p.y < 140, side);
  }
  // Symmetric left to right.
  const l = outlineAnchor("star", 160, 140, "left"), r = outlineAnchor("star", 160, 140, "right");
  near({ x: 160 - l.x, y: l.y }, r, "symmetry");
});

test("flag and document anchors follow the waves", () => {
  // Waves cross their center line at the horizontal midpoint.
  near(outlineAnchor("flag", 160, 100, "top"), { x: 80, y: 10 }, "flag top");
  near(outlineAnchor("flag", 160, 100, "bottom"), { x: 80, y: 90 }, "flag bottom");
  near(outlineAnchor("document", 160, 100, "top"), { x: 80, y: 0 }, "document top");
  near(outlineAnchor("document", 160, 100, "bottom"), { x: 80, y: 90 }, "document bottom");
});

test("wave height is capped on tall shapes", () => {
  const a = textArea("flag", 120, 400);
  assert.equal(a.y, 20);
  assert.equal(a.h, 360);
});

test("geometry anchors use the outline for shaped boxes", () => {
  const b = { x: 10, y: 20, w: 100, h: 60, shape: "diamond" };
  near(anchor(b, "left"), { x: 10, y: 50 }, "diamond left");
  const s = { x: 0, y: 0, w: 160, h: 140, shape: "star" };
  assert.ok(anchor(s, "bottom").y < 140);
  assert.throws(() => anchor(b, "corner"));
});

test("minimum sizes exist only for shapes that need room", () => {
  assert.equal(minSize("rect"), null);
  assert.deepEqual(minSize("star"), { w: 160, h: 140 });
});
