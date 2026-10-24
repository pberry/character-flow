// The charts this browser has opened, kept in localStorage. There's no server-side
// list (a chart is reached only by its secret link), so this is how the home page
// finds your charts again. Storage can be missing or throw (private windows,
// blocked site data), so every access is guarded and failures mean an empty list.

export const RECENT_KEY = "charflow.recent";
export const MAX_RECENT = 50;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function valid(entry) {
  return entry && typeof entry.edit_key === "string" && typeof entry.name === "string";
}

export function loadRecent(storage = defaultStorage()) {
  try {
    const list = JSON.parse(storage?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch {
    return [];
  }
}

function save(storage, list) {
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Not remembered; the chart's link still works.
  }
}

// Adds or updates a chart (any API record with edit_key), newest first.
export function rememberChart(record, storage = defaultStorage()) {
  const entry = { edit_key: record.edit_key, view_key: record.view_key, name: record.name, updated_at: record.updated_at };
  const rest = loadRecent(storage).filter((e) => e.edit_key !== record.edit_key);
  const list = [entry, ...rest].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  save(storage, list.slice(0, MAX_RECENT));
  return list;
}

export function forgetChart(editKey, storage = defaultStorage()) {
  save(storage, loadRecent(storage).filter((e) => e.edit_key !== editKey));
}
