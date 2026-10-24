// Thin wrappers around the JSON API.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body) {
  const resp = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (resp.status === 204) return null;
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new ApiError(json.error || resp.statusText, resp.status);
  return json;
}

// Charts are reached only by key: the edit key reads and writes, the view key
// reads and copies.
export const createChart = (name, data) => request("POST", "/api/charts", { name, data });
export const getChart = (editKey) => request("GET", `/api/edit/${encodeURIComponent(editKey)}`);
export const updateChart = (editKey, fields) => request("PUT", `/api/edit/${encodeURIComponent(editKey)}`, fields);
export const deleteChart = (editKey) => request("DELETE", `/api/edit/${encodeURIComponent(editKey)}`);
export const viewChart = (viewKey) => request("GET", `/api/view/${encodeURIComponent(viewKey)}`);
export const copyChart = (viewKey, name) => request("POST", `/api/view/${encodeURIComponent(viewKey)}/copy`, { name });
