import { randomBytes } from 'node:crypto';
const TTL_MS = 8 * 3600 * 1000;
export function createSession(db, userId, clock) {
  const id = randomBytes(32).toString('base64url'); const csrf = randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO sessions (id, user_id, csrf, expires_at) VALUES (?,?,?,?)').run(id, userId, csrf, clock.now().getTime() + TTL_MS);
  return { id, csrf };
}
export function loadSession(db, id, clock) {
  if (!id) return null;
  const r = db.prepare(`SELECT s.id sid, s.csrf, s.expires_at, u.id, u.username, u.display_name, u.role, u.manager_id
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(id);
  if (!r || r.expires_at < clock.now().getTime()) return null;
  return { sessionId: r.sid, csrf: r.csrf, user: { id: r.id, username: r.username, displayName: r.display_name, role: r.role, managerId: r.manager_id } };
}
export const destroySession = (db, id) => db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
