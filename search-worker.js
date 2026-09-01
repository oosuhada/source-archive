let documents = [];
let publicIds = {};
const normalize = (value) => String(value).toLowerCase().trim();

async function initialize(payload) {
  publicIds = payload.publicIds || {};
  const version = payload.version ? `?v=${encodeURIComponent(payload.version)}` : "";
  const response = await fetch(`data/search-index.json${version}`);
  if (!response.ok) throw new Error(`Search index HTTP ${response.status}`);
  ({ documents } = await response.json());
  postMessage({ type: "ready", documents: documents.length });
}

function score(document, query) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  let total = 0;
  for (const token of tokens) {
    let value = 0;
    const publicId = publicIds[document.id] || document.id;
    if (String(Number(publicId)) === token || publicId === token) value = 130;
    if (document.title === token) value = Math.max(value, 120);
    else if (document.title.startsWith(token)) value = Math.max(value, 90);
    else if (document.title.includes(token)) value = Math.max(value, 70);
    if (document.category === token) value = Math.max(value, 55);
    else if (document.category.includes(token)) value = Math.max(value, 34);
    for (const term of document.terms) {
      if (term === token) value = Math.max(value, 48);
      else if (term.startsWith(token)) value = Math.max(value, 34);
      else if (term.includes(token)) value = Math.max(value, 18);
    }
    if (!value) return 0;
    total += value;
  }
  return total;
}

self.addEventListener("message", async ({ data }) => {
  try {
    if (data.type === "init") return await initialize(data);
    if (data.type !== "search") return;
    const startedAt = performance.now();
    const results = documents.map((document) => ({ id: document.id, score: score(document, data.query) }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score || Number(publicIds[left.id] || left.id) - Number(publicIds[right.id] || right.id));
    postMessage({ type: "results", requestId: data.requestId, ids: results.map((result) => result.id), duration: performance.now() - startedAt });
  } catch (error) {
    postMessage({ type: "error", message: String(error?.message || error) });
  }
});
