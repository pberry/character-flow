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

export const listCharts = () => request("GET", "/api/charts");
export const getChart = (id) => request("GET", `/api/charts/${id}`);
export const createChart = (name, data) => request("POST", "/api/charts", { name, data });
export const updateChart = (id, fields) => request("PUT", `/api/charts/${id}`, fields);
export const deleteChart = (id) => request("DELETE", `/api/charts/${id}`);
export const copyChart = (id, name) => request("POST", `/api/charts/${id}/copy`, { name });
