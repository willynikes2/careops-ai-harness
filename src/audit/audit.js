export function createAudit(db, clock) {
  const insert = db.prepare('INSERT INTO audit_events (at, actor_id, actor_role, kind, security, turn_id, detail_json) VALUES (?,?,?,?,?,?,?)');
  return {
    event({ actor = null, kind, security = false, turnId = null, detail = {} }) {
      insert.run(clock.now().toISOString(), actor?.id ?? null, actor?.role ?? null, kind, security ? 1 : 0, turnId, JSON.stringify(detail));
    },
  };
}
