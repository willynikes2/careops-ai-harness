// HTTP client for the separate knowledge-base-server instance (internal network, API key).
export function createKbClient({ baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 5000 }) {
  const get = async (path) => {
    const res = await fetchImpl(`${baseUrl}${path}`, { headers: { 'X-API-Key': apiKey }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`kb_http_${res.status}`);
    return res.json();
  };
  return {
    async search(q, { limit = 8, collection } = {}) {
      const { results } = await get(`/api/v1/search?q=${encodeURIComponent(q)}&limit=${limit}${collection ? `&type=${encodeURIComponent(collection)}` : ''}`);
      return results.map(r => ({ id: String(r.id), title: r.title, collection: r.doc_type, rank: r.rank }));
    },
    async get(id) { const d = await get(`/api/v1/documents/${encodeURIComponent(id)}`); return { id: String(d.id), title: d.title, collection: d.doc_type, content: d.content ?? '' }; },
    async health() { await get('/api/v1/health'); return true; },
  };
}
