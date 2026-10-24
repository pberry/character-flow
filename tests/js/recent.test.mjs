import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RECENT, RECENT_KEY, forgetChart, loadRecent, rememberChart } from "../../app/static/js/recent.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

const rec = (key, name, t) => ({ edit_key: key, view_key: `v-${key}`, name, updated_at: t, data: { big: true } });

test("remembers charts newest first without their data", () => {
  const s = memoryStorage();
  rememberChart(rec("a", "Meren", "2026-10-20T00:00:00+00:00"), s);
  rememberChart(rec("b", "Dahlia", "2026-10-22T00:00:00+00:00"), s);
  const list = loadRecent(s);
  assert.deepEqual(list.map((e) => e.name), ["Dahlia", "Meren"]);
  assert.deepEqual(list[0], { edit_key: "b", view_key: "v-b", name: "Dahlia", updated_at: "2026-10-22T00:00:00+00:00" });
});

test("updates an existing entry instead of duplicating it", () => {
  const s = memoryStorage();
  rememberChart(rec("a", "Meren", "2026-10-20T00:00:00+00:00"), s);
  rememberChart(rec("a", "Meren v2", "2026-10-23T00:00:00+00:00"), s);
  assert.deepEqual(loadRecent(s).map((e) => e.name), ["Meren v2"]);
});

test("forgets a chart", () => {
  const s = memoryStorage();
  rememberChart(rec("a", "A", "1"), s);
  rememberChart(rec("b", "B", "2"), s);
  forgetChart("a", s);
  assert.deepEqual(loadRecent(s).map((e) => e.edit_key), ["b"]);
});

test("keeps at most MAX_RECENT", () => {
  const s = memoryStorage();
  for (let i = 0; i < MAX_RECENT + 5; i++) rememberChart(rec(`k${i}`, `C${i}`, String(i).padStart(3, "0")), s);
  assert.equal(loadRecent(s).length, MAX_RECENT);
});

test("survives missing, corrupt, or throwing storage", () => {
  assert.deepEqual(loadRecent(null), []);
  assert.deepEqual(loadRecent(memoryStorage({ [RECENT_KEY]: "not json" })), []);
  assert.deepEqual(loadRecent(memoryStorage({ [RECENT_KEY]: '[{"nope":1}, {"edit_key":"a","name":"A"}]' })).length, 1);
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadRecent(throwing), []);
  assert.doesNotThrow(() => rememberChart(rec("a", "A", "1"), throwing));
  assert.doesNotThrow(() => forgetChart("a", throwing));
});
