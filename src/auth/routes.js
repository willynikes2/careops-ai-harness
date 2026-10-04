import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler, parseBody, requireUser } from '../http/middleware.js';
import { errors, HttpError } from '../http/errors.js';
import { verifyPassword } from './passwords.js';
import { createSession, destroySession } from './sessions.js';

const Login = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) });
const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name ?? u.displayName, role: u.role });

export function authRoutes({ db, clock, config, audit }) {
  const r = Router();
  const cookieOpts = { httpOnly: true, sameSite: 'strict', secure: config.secureCookies, path: '/', maxAge: 8 * 3600 * 1000 };
  r.post('/login', rateLimit({ windowMs: 60_000, limit: 10, skipSuccessfulRequests: true, handler: (req, res, next) => next(errors.rateLimited()) }), asyncHandler(async (req, res) => {
    const { username, password } = parseBody(Login, req.body);
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());
    if (!u || !verifyPassword(password, u.password_hash)) {
      audit.event({ kind: 'login_failed', security: true, detail: { username: username.slice(0, 64) } });
      throw new HttpError(401, 'unauthenticated', 'Username or password is incorrect.');
    }
    const s = createSession(db, u.id, clock);
    audit.event({ actor: { id: u.id, role: u.role }, kind: 'login_success' });
    res.cookie('careops_sid', s.id, cookieOpts).json({ user: publicUser(u), csrfToken: s.csrf });
  }));
  const authed = requireUser({ db, clock });
  r.get('/me', authed, (req, res) => res.json({ user: publicUser(req.user), csrfToken: req.session.csrf }));
  r.post('/logout', authed, (req, res) => { destroySession(db, req.session.sessionId); res.clearCookie('careops_sid', { path: '/' }).status(204).end(); });
  return r;
}
