import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIDE_W, MAX_COUNT, ITEM_W, ITEM_BADGES, sideWidth, normalizeSidebar, enableSidebar, disableSidebar,
  getSection, addSection, renameSection, moveSection, deleteSection, allItems, findItem, getItem,
  addItem, updateItem, moveItem, deleteItem, estimateLines, tickPositions, layoutSidebar,
} from "../../app/static/js/sidebar.js";
import { layoutBadges } from "../../app/static/js/badges.js";

const chartWithColumn = () => {
  const chart = { sidebar: null };
  enableSidebar(chart);
  return chart;
};

test("no column by default; enabling adds the four default sections once", () => {
  const chart = { sidebar: null };
  assert.equal(sideWidth(chart), 0);
  enableSidebar(chart);
  assert.equal(sideWidth(chart), SIDE_W);
  assert.deepEqual(chart.sidebar.sections.map((s) => s.name), ["Gear", "Resources", "Healing", "Conditions"]);
  addItem(chart, { sectionId: "s1", text: "Boots" });
  enableSidebar(chart);
  assert.equal(allItems(chart).length, 1, "enabling again keeps what's there");
  disableSidebar(chart);
  assert.equal(chart.sidebar, null);
});

test("normalizeSidebar fills in and drops malformed data", () => {
  assert.equal(normalizeSidebar(null), null);
  assert.equal(normalizeSidebar("x"), null);
  assert.deepEqual(normalizeSidebar({}), { sections: [] });
  const n = normalizeSidebar({
    sections: [
      { id: "s1", name: "  ", items: [{ id: "t1", text: 5, count: 99, badges: [{ type: "cost", text: "1" }, { type: "nope", text: "x" }] }, null] },
      { name: "no id" },
    ],
  });
  assert.deepEqual(n, {
    sections: [{ id: "s1", name: "Section", items: [{ id: "t1", text: "", count: MAX_COUNT, badges: [{ type: "cost", text: "1" }] }] }],
  });
});

test("sections: add after, rename, move, delete", () => {
  const chart = chartWithColumn();
  const s = addSection(chart, "s1", "Potions");
  assert.equal(s.id, "s5");
  assert.deepEqual(chart.sidebar.sections.map((x) => x.id), ["s1", "s5", "s2", "s3", "s4"]);
  renameSection(chart, "s5", "  Healing items ");
  assert.equal(getSection(chart, "s5").name, "Healing items");
  renameSection(chart, "s5", "   ");
  assert.equal(getSection(chart, "s5").name, "Healing items", "blank names are ignored");
  assert.equal(moveSection(chart, "s5", -1), true);
  assert.equal(moveSection(chart, "s5", -1), false);
  deleteSection(chart, "s5");
  assert.equal(getSection(chart, "s5"), null);
  assert.equal(addSection({ sidebar: null }), null);
});

test("items: add at the end or after another, update, move within section, delete", () => {
  const chart = chartWithColumn();
  const a = addItem(chart, { sectionId: "s2", text: "Focus Points" });
  const b = addItem(chart, { sectionId: "s2", text: "Luck Points" });
  const c = addItem(chart, { afterId: a.id, text: "Ki" });
  assert.deepEqual([a.id, b.id, c.id], ["t1", "t2", "t3"]);
  assert.deepEqual(getSection(chart, "s2").items.map((i) => i.text), ["Focus Points", "Ki", "Luck Points"]);
  assert.equal(addItem(chart, { sectionId: "nope" }), null);
  updateItem(chart, a.id, { count: 3 });
  assert.equal(getItem(chart, a.id).count, 3);
  updateItem(chart, a.id, { count: -2 });
  assert.equal(getItem(chart, a.id).count, 0);
  updateItem(chart, a.id, { count: 500, text: "FP" });
  assert.deepEqual([a.count, a.text], [MAX_COUNT, "FP"]);
  assert.equal(moveItem(chart, b.id, 1), false, "can't move past the end of its section");
  assert.equal(moveItem(chart, b.id, -1), true);
  assert.equal(findItem(chart, b.id).index, 1);
  deleteItem(chart, c.id);
  assert.deepEqual(allItems(chart).map((i) => i.id), ["t1", "t2"]);
});

test("estimateLines counts paragraphs and word wrap", () => {
  assert.equal(estimateLines(""), 1);
  assert.equal(estimateLines("Boots"), 1);
  assert.equal(estimateLines("Boots\nquiet"), 2);
  assert.equal(estimateLines("No sound on any surface, Adv to Dexterity"), 3);
  assert.equal(estimateLines("x".repeat(45)), 3);
});

test("tick circles fill rows left to right, then wrap", () => {
  const t = tickPositions(12, 30);
  assert.equal(t.length, 12);
  assert.equal(t[0].y, t[8].y);
  assert.ok(t[9].y > t[8].y, "tenth circle starts a new row");
  assert.equal(t[9].x, t[0].x);
  assert.deepEqual(tickPositions(0, 30), []);
});

test("layoutSidebar stacks sections and items top to bottom", () => {
  const chart = chartWithColumn();
  addItem(chart, { sectionId: "s1", text: "Boots" });
  const fp = addItem(chart, { sectionId: "s2", text: "Focus Points" });
  updateItem(chart, fp.id, { count: 3 });
  const l = layoutSidebar(chart.sidebar, -350);
  assert.deepEqual([l.x, l.w], [-350, SIDE_W]);
  assert.equal(l.sections.length, 4);
  const [gear, res] = l.sections;
  const [boots, focus] = l.items;
  assert.ok(boots.y >= gear.y + gear.h);
  assert.ok(res.y >= boots.y + boots.h);
  assert.ok(focus.y >= res.y + res.h);
  assert.equal(focus.ticks.length, 3);
  assert.ok(focus.h > boots.h, "tick circles add height");
  assert.ok(l.height > focus.y + focus.h);
  assert.equal(boots.x, -350 + 10);
  assert.deepEqual(layoutSidebar(null, 0).items, []);
});

test("item badges stack inward so they stay inside the column", () => {
  const item = { w: ITEM_W, h: 40, shape: "rect", badges: [{ type: "recharge", text: "SR" }, { type: "recharge", text: "LR" }] };
  const [sr, lr] = layoutBadges(item, ITEM_BADGES);
  assert.equal(sr.x, ITEM_W);
  assert.ok(lr.x < sr.x);
  const [, out] = layoutBadges(item);
  assert.ok(out.x > ITEM_W, "boxes still stack outward");
});

test("badges hanging off an item push the next item down", () => {
  const chart = chartWithColumn();
  const a = addItem(chart, { sectionId: "s1", text: "A" });
  addItem(chart, { sectionId: "s1", text: "B" });
  const plain = layoutSidebar(chart.sidebar, 0).items[1].y;
  a.badges = [{ type: "recharge", text: "LR" }];
  assert.ok(layoutSidebar(chart.sidebar, 0).items[1].y > plain);
});

test("items: optional color, kept only when valid", () => {
  const chart = chartWithColumn();
  const a = addItem(chart, { sectionId: "s1", text: "Rope" });
  assert.equal("color" in a, false, "new items have no color");
  updateItem(chart, a.id, { color: "#fecaca" });
  assert.equal(a.color, "#fecaca");
  updateItem(chart, a.id, { color: "red" });
  assert.equal("color" in a, false, "an invalid color clears it");
  const n = normalizeSidebar({ sections: [{ id: "s1", items: [{ id: "t1", color: "#BBF7D0" }, { id: "t2", color: "url(x)" }] }] });
  assert.equal(n.sections[0].items[0].color, "#BBF7D0");
  assert.equal("color" in n.sections[0].items[1], false);
});
