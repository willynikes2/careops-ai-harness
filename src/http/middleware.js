import { randomUUID } from 'node:crypto';
import { errors } from './errors.js';
import { loadSession } from '../auth/sessions.js';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export function correlationId(req, res, next) { req.correlationId = randomUUID(); res.setHeader('X-Correlation-Id', req.correlationId); next(); }
export function parseBody(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw errors.invalid(r.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}
// Identity comes only from the server-side session; the client never asserts a role.
export function requireUser({ db, clock }) {
  return (req, res, next) => {
    const s = loadSession(db, req.cookies?.careops_sid, clock);
    if (!s) return next(errors.unauth());
    req.user = s.user; req.session = s;
    if (req.method !== 'GET' && req.get('x-csrf-token') !== s.csrf) return next(errors.forbidden('Missing or invalid CSRF token.'));
    next();
  };
}
export const requireRole = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : next(errors.forbidden()));
// Records refused API requests (401/403, and 404s on owned resources, which hide whether a record exists)
// as sanitized security events: method, route path, actor, status, code, correlation id — never cookies,
// tokens or bodies. Identical probes are recorded at most once a minute so the audit cannot be flooded.
const OWNED = /^\/api\/(actions|traces|claims|pto\/requests)\//;
export function auditDenials(audit, clock, { windowMs = 60_000 } = {}) {
  const seen = new Map();
  return (err, req, res, next) => {
    const status = err?.status;
    const path = req.originalUrl.split('?')[0];
    const relevant = path.startsWith('/api/') && !path.startsWith('/api/auth/')
      && (status === 401 || status === 403 || (status === 404 && req.user && OWNED.test(path)));
    if (relevant) {
      const now = clock.now().getTime();
      const sig = `${req.user?.id ?? req.ip}|${req.method}|${path}|${status}`;
      if (!(now - (seen.get(sig) ?? -Infinity) < windowMs)) {
        if (seen.size > 5000) seen.clear();
        seen.set(sig, now);
        audit.event({ actor: req.user ?? null, kind: 'api_access_denied', security: true,
          detail: { method: req.method, path: path.slice(0, 200), status, code: err.code ?? 'error', reason: String(err.message ?? '').slice(0, 120), correlationId: req.correlationId } });
      }
    }
    next(err);
  };
}
