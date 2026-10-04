// One adapter behind the provider interface: complete({model, system, user}) → {text, usage, latencyMs, model}.
// Swapping to an approved enterprise provider means writing another class with the same method.
export class ProviderError extends Error {}
export class OpenRouterProvider {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 20_000, baseUrl = 'https://openrouter.ai/api/v1' }) { Object.assign(this, { apiKey, fetchImpl, timeoutMs, baseUrl }); }
  async complete({ model, system, user, temperature = 0 }) {
    if (!this.apiKey) throw new ProviderError('reasoning provider not configured');
    const started = performance.now();
    const deadline = started + this.timeoutMs; // one budget for the call and its retry
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = Math.round(deadline - performance.now());
      if (remaining < 50) throw new ProviderError('provider_timeout');
      let res;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST', signal: AbortSignal.timeout(remaining),
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'CareOps Harness Demo' },
          body: JSON.stringify({ model, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            response_format: { type: 'json_object' }, usage: { include: true }, max_tokens: 800, provider: { sort: 'latency' } }),
        });
      } catch (err) { if (attempt === 0 && err.name !== 'TimeoutError') continue; throw new ProviderError(`provider_unreachable: ${err.name}`); }
      if ((res.status === 429 || res.status >= 500) && attempt === 0) continue;
      if (!res.ok) throw new ProviderError(`provider_http_${res.status}`);
      const body = await res.json();
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new ProviderError('provider_empty_response');
      return { text, model: body.model ?? model, latencyMs: Math.round(performance.now() - started),
        usage: { tokensIn: body.usage?.prompt_tokens ?? 0, tokensOut: body.usage?.completion_tokens ?? 0, costUsd: Number(body.usage?.cost ?? 0) } };
    }
    throw new ProviderError('provider_retries_exhausted');
  }
}
