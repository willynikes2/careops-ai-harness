// Append-only audit trail + per-turn traces. Reset never deletes these.
export function createAudit(db, clock) {
  const insert = db.prepare('INSERT INTO audit_events (at, actor_id, actor_role, kind, security, turn_id, detail_json) VALUES (?,?,?,?,?,?,?)');
  return {
    event({ actor = null, kind, security = false, turnId = null, detail = {} }) {
      insert.run(clock.now().toISOString(), actor?.id ?? null, actor?.role ?? null, kind, security ? 1 : 0, turnId, JSON.stringify(detail));
    },
    saveTrace(t) { db.prepare('INSERT OR REPLACE INTO traces (turn_id, user_id, at, steps_json) VALUES (?,?,?,?)').run(t.turnId, t.user.id, t.at, JSON.stringify(t.steps)); },
    getTrace(turnId) {
      const r = db.prepare('SELECT t.*, u.username, u.display_name, u.role FROM traces t JOIN users u ON u.id = t.user_id WHERE t.turn_id = ?').get(turnId);
      return r ? { turnId: r.turn_id, at: r.at, user: { id: r.user_id, username: r.username, displayName: r.display_name, role: r.role }, steps: JSON.parse(r.steps_json) } : null;
    },
    list({ securityOnly = false, limit = 100 } = {}) {
      const n = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 500) : 100;
      return db.prepare(`SELECT a.*, u.display_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
        ${securityOnly ? 'WHERE a.security = 1' : ''} ORDER BY a.id DESC LIMIT ?`).all(n)
        .map(r => ({ id: r.id, at: r.at, actorName: r.display_name, actorRole: r.actor_role, kind: r.kind, security: r.security === 1, turnId: r.turn_id, detail: JSON.parse(r.detail_json) }));
    },
  };
}
