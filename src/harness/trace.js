export function startTrace(turnId, user, clock) {
  const steps = []; let last = performance.now(); const at = clock.now().toISOString();
  return {
    turnId, user,
    add(name, status, summary, detail = {}) { const now = performance.now(); steps.push({ name, status, summary, detail, ms: Math.round(now - last) }); last = now; },
    decision: null,
    toJSON() { return { turnId, at, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }, steps, decision: this.decision }; },
  };
}
