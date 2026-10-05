import { createHash } from 'node:crypto';
import { errors } from '../http/errors.js';
// One business effect per client click: the first result is stored and replayed for the same key —
// but only for the identical request. The key is per user; the fingerprint binds it to the operation,
// the resource and the body, so a reused key on a changed request is a 409, never someone else's success.
export function withIdempotency(db, { key, userId, scope, body = {} }, fn) {
  if (!key || typeof key !== 'string' || key.length > 100) throw errors.invalid('idempotencyKey is required.');
  const k = `${userId}::${key}`;
  const { idempotencyKey, ...rest } = body;
  const fingerprint = createHash('sha256').update(JSON.stringify([scope, Object.keys(rest).sort().map(f => [f, rest[f]])])).digest('hex');
  return db.transaction(() => {
    const prior = db.prepare('SELECT result_json, fingerprint FROM idempotency_keys WHERE key = ?').get(k);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw errors.conflict('This request key was already used for a different request. Refresh and try again.');
      return JSON.parse(prior.result_json);
    }
    const result = fn();
    db.prepare('INSERT INTO idempotency_keys (key, user_id, result_json, created_at, fingerprint) VALUES (?,?,?,?,?)').run(k, userId, JSON.stringify(result), new Date().toISOString(), fingerprint);
    return result;
  })();
}
