// Append-only audit trail + per-turn traces. Reset never deletes these.
export function createAudit(db, clock) {
  const insert = db.prepare('INSERT INTO audit_events (at, actor_id, actor_role, kind, security, turn_id, detail_json) VALUES (?,?,?,?,?,?,?)');
  return {
    // returns a human-readable event id (EVT-000123) so traces and screens can cite the exact audit record
    event({ actor = null, kind, security = false, turnId = null, detail = {} }) {
      const info = insert.run(clock.now().toISOString(), actor?.id ?? null, actor?.role ?? null, kind, security ? 1 : 0, turnId, JSON.stringify(detail));
      return `EVT-${String(info.lastInsertRowid).padStart(6, '0')}`;
    },
    saveTrace(t) { db.prepare('INSERT OR REPLACE INTO traces (turn_id, user_id, at, steps_json, decision_json) VALUES (?,?,?,?,?)').run(t.turnId, t.user.id, t.at, JSON.stringify(t.steps), JSON.stringify(t.decision ?? null)); },
    // Later events (confirm, dismiss, expiry) update the current status but keep the turn's original
    // execution status and append to a lifecycle list, so the record never contradicts itself.
    updateDecision(turnId, patch, lifecycleEvent) {
      const r = db.prepare('SELECT decision_json FROM traces WHERE turn_id = ?').get(turnId);
      if (!r) return;
      const d = JSON.parse(r.decision_json ?? 'null') ?? {};
      const next = { ...d, ...patch, initialExecution: d.initialExecution ?? d.execution };
      if (lifecycleEvent) next.lifecycle = [...(d.lifecycle ?? []), { at: clock.now().toISOString(), ...lifecycleEvent }];
      db.prepare('UPDATE traces SET decision_json = ? WHERE turn_id = ?').run(JSON.stringify(next), turnId);
    },
    getTrace(turnId) {
      const r = db.prepare('SELECT t.*, u.username, u.display_name, u.role FROM traces t JOIN users u ON u.id = t.user_id WHERE t.turn_id = ?').get(turnId);
      return r ? { turnId: r.turn_id, at: r.at, user: { id: r.user_id, username: r.username, displayName: r.display_name, role: r.role }, steps: JSON.parse(r.steps_json), decision: JSON.parse(r.decision_json ?? 'null') } : null;
    },
    list({ securityOnly = false, limit = 100 } = {}) {
      const n = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 500) : 100;
      return db.prepare(`SELECT a.*, u.display_name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
        ${securityOnly ? 'WHERE a.security = 1' : ''} ORDER BY a.id DESC LIMIT ?`).all(n)
        .map(r => ({ id: r.id, at: r.at, actorName: r.display_name, actorRole: r.actor_role, kind: r.kind, security: r.security === 1, turnId: r.turn_id, detail: JSON.parse(r.detail_json) }));
    },
  };
}
