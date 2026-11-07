import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_COUNT, TICK, TICK_R, clampCount, fitHeight, layoutTicks } from "../../app/static/js/ticks.js";
import { SHAPES, shapePoints, textArea, outlineAnchor } from "../../app/static/js/shapes.js";
import { layoutBadges } from "../../app/static/js/badges.js";
import { SIDES } from "../../app/static/js/geometry.js";
import { addBox, newChart, setBoxCount } from "../../app/static/js/model.js";

const ALL_BADGES = [
  { type: "cost", text: "1 FP" },
  { type: "duration", text: "10 min" },
  { type: "recharge", text: "LR" },
  { type: "modifier", text: "2x" },
];

function inside(pts, w, h, x, y) {
  if (!pts) return x >= 0 && x <= w && y >= 0 && y <= h;
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// A box of each shape at its default size, grown to fit `count` circles.
function fittedBox(shape, count, badges = []) {
  const chart = newChart();
  const box = addBox(chart, { shape });
  box.badges = badges.map((b) => ({ ...b }));
  setBoxCount(chart, box.id, count);
  return box;
}

test("clampCount keeps counts whole and between 0 and the maximum", () => {
  assert.equal(clampCount(3.7), 3);
  assert.equal(clampCount(-2), 0);
  assert.equal(clampCount(99), MAX_COUNT);
  assert.equal(clampCount("5"), 5);
  assert.equal(clampCount(""), 0);
  assert.equal(clampCount("abc"), 0);
  assert.equal(clampCount(undefined), 0);
});

test("circles are smaller than the smallest badge", () => {
  assert.ok(2 * TICK_R < 24);
});

test("no count: no circles and the full text area", () => {
  const box = { shape: "rect", w: 160, h: 70, badges: [] };
  assert.deepEqual(layoutTicks(box), { ticks: [], text: textArea("rect", 160, 70) });
  assert.deepEqual(layoutTicks({ ...box, count: 0 }).ticks, []);
});

const perRow = (ticks) => {
  const rows = [...new Set(ticks.map((t) => t.y))].sort((a, b) => a - b);
  return rows.map((y) => ticks.filter((t) => t.y === y));
};

test("circles sit below the text in centered rows", () => {
  const box = { shape: "rect", w: 160, h: 120, count: 7, badges: [] };
  const { ticks, text } = layoutTicks(box);
  assert.equal(ticks.length, 7);
  for (const t of ticks) assert.ok(t.y - TICK_R >= text.y + text.h);
  const [first] = perRow(ticks);
  const mid = (first[0].x + first[first.length - 1].x) / 2;
  assert.ok(Math.abs(mid - 80) < 0.01);
});

test("rows are spread evenly, top rows taking any extra", () => {
  const counts = (box) => perRow(layoutTicks(box).ticks).map((r) => r.length);
  assert.deepEqual(counts({ shape: "rect", w: 160, h: 200, count: 20, badges: [] }), [7, 7, 6]);
  assert.deepEqual(counts(fittedBox("arrow-right", 8)), [4, 4]);
});

test("on every shape and count, circles stay inside the outline, clear of arrows and badges", () => {
  for (const { id: shape } of SHAPES) {
    for (const badges of [[], ALL_BADGES]) {
      for (let n = 1; n <= MAX_COUNT; n++) {
        const box = fittedBox(shape, n, badges);
        const where = `${shape} n=${n} badges=${badges.length}`;
        const { ticks, text } = layoutTicks(box);
        assert.equal(ticks.length, n, where);
        assert.ok(text.h >= 16, `${where}: text room ${text.h}`);
        const pts = shapePoints(shape, box.w, box.h);
        const anchors = SIDES.map((side) => outlineAnchor(shape, box.w, box.h, side));
        const placed = layoutBadges(box);
        for (const t of ticks) {
          for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            assert.ok(inside(pts, box.w, box.h, t.x + dx * TICK_R, t.y + dy * TICK_R), `${where}: tick outside at ${t.x},${t.y}`);
          }
          // The anchor dots are r=6; arrows leave the outline outward from them.
          for (const a of anchors) assert.ok(Math.hypot(a.x - t.x, a.y - t.y) >= TICK_R + 6, `${where}: tick on an arrow anchor`);
          for (const b of placed) {
            const clear = t.x + TICK_R <= b.x - b.w / 2 || t.x - TICK_R >= b.x + b.w / 2
              || t.y + TICK_R <= b.y - b.h / 2 || t.y - TICK_R >= b.y + b.h / 2;
            assert.ok(clear, `${where}: tick under the ${b.type} badge`);
          }
        }
        for (let i = 0; i < ticks.length; i++) {
          for (let j = i + 1; j < ticks.length; j++) {
            assert.ok(Math.hypot(ticks[i].x - ticks[j].x, ticks[i].y - ticks[j].y) >= TICK - 0.01, `${where}: ticks overlap`);
          }
        }
      }
    }
  }
});

test("fitHeight finds the smallest grid height that leaves the text room", () => {
  const box = { shape: "rect", w: 160, count: 4, badges: [] };
  const h = fitHeight(box, 50, { minH: 30, grid: 10 });
  assert.equal(h % 10, 0);
  assert.ok(layoutTicks({ ...box, h }).text.h >= 50 - 0.5);
  assert.ok(layoutTicks({ ...box, h: h - 10 }).text.h < 50 - 0.5);
  assert.equal(fitHeight({ ...box, count: 0 }, 10, { minH: 30 }), 30);
});

test("stepping the count up and down always lands on the same height", () => {
  for (const { id: shape } of SHAPES) {
    for (const badges of [[], ALL_BADGES]) {
      const chart = newChart();
      const box = addBox(chart, { shape });
      box.badges = badges.map((b) => ({ ...b }));
      const h0 = box.h;
      const heights = new Map();
      const walk = [5, 6, 7, 10, 9, 5, 1, 20, 19, 3, 5, 0];
      for (let n = 1; n <= MAX_COUNT; n++) walk.push(n);
      for (let n = MAX_COUNT - 1; n >= 0; n--) walk.push(n);
      for (const n of walk) {
        setBoxCount(chart, box.id, n);
        const where = `${shape} badges=${badges.length} n=${n}`;
        if (heights.has(n)) assert.equal(box.h, heights.get(n), where);
        else heights.set(n, box.h);
        if (n === 0) assert.equal(box.h, h0, where);
      }
    }
  }
});
