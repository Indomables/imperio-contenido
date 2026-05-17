/**
 * Cliente API que habla con Netlify Functions.
 * Cada función corresponde a un endpoint en /netlify/functions/<name>.
 *
 * Por ahora son stubs — las funciones backend se implementan en Fase 2.
 */

async function request(method, path, body) {
  const url = `/api${path}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`${method} ${url} → ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// IDEAS
export const ideas = {
  list: () => request("GET", "/ideas"),
  create: (data) => request("POST", "/ideas", data),
  update: (id, data) => request("PATCH", `/ideas/${id}`, data),
  remove: (id) => request("DELETE", `/ideas/${id}`),
};

// PIEZAS
export const piezas = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/piezas${qs ? `?${qs}` : ""}`);
  },
  create: (data) => request("POST", "/piezas", data),
  update: (id, data) => request("PATCH", `/piezas/${id}`, data),
  remove: (id) => request("DELETE", `/piezas/${id}`),
  move: (id, columna) => request("POST", `/piezas/${id}/move`, { columna }),
};

// MÉTRICAS
export const metricas = {
  all: () => request("GET", "/metricas"),
  byPieza: (piezaId) => request("GET", `/metricas/${piezaId}`),
  upsert: (piezaId, datos) => request("PUT", `/metricas/${piezaId}`, { datos }),
};

// SETTINGS
export const settings = {
  all: () => request("GET", "/settings"),
  set: (key, value) => request("PUT", `/settings/${key}`, { value }),
};

// CAPTURE BAR (atajo)
// Si tag === "idea" → crea idea
// Si tag in [email, reel, relampago, youtube, grieta] → crea pieza en "desarrollo"
export const capture = (text, tag) =>
  request("POST", "/capture", { text, tag });
