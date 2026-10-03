import { errors } from '../http/errors.js';
// One business effect per client click: the first result is stored and replayed for the same key.
export function withIdempotency(db, { key, userId, scope }, fn) {
  if (!key || typeof key !== 'string' || key.length > 100) throw errors.invalid('idempotencyKey is required.');
  const k = `${userId}:${scope}:${key}`;
  return db.transaction(() => {
    const prior = db.prepare('SELECT result_json FROM idempotency_keys WHERE key = ?').get(k);
    if (prior) return JSON.parse(prior.result_json);
    const result = fn();
    db.prepare('INSERT INTO idempotency_keys (key, user_id, result_json, created_at) VALUES (?,?,?,?)').run(k, userId, JSON.stringify(result), new Date().toISOString());
    return result;
  })();
}
