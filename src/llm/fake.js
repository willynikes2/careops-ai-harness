// Scripted provider for tests: an array of responses (consumed in order) or a function (req, n) => response.
export class FakeProvider {
  constructor(responder = []) { this.responder = responder; this.calls = []; }
  async complete(req) {
    this.calls.push(req);
    const out = typeof this.responder === 'function' ? await this.responder(req, this.calls.length) : this.responder.shift();
    if (out instanceof Error) throw out;
    if (out === undefined) throw new Error('FakeProvider: no scripted response left');
    const text = typeof out === 'string' ? out : JSON.stringify(out);
    return { text, usage: { tokensIn: 100, tokensOut: 50, costUsd: 0.0001 }, latencyMs: 5, model: req.model };
  }
}
