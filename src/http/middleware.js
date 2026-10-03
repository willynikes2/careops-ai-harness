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
    if (req.method !== 'GET' && req.get('x-csrf-token') !== s.csrf) return next(errors.forbidden('Missing or invalid CSRF token.'));
    req.user = s.user; req.session = s; next();
  };
}
export const requireRole = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : next(errors.forbidden()));
