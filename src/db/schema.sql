CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee','manager','billing','admin')),
  manager_id TEXT REFERENCES users(id), password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pto_balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id), hours_available REAL NOT NULL, hours_pending REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS pto_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, hours REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','DENIED')),
  decided_by TEXT REFERENCES users(id), decided_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), payer TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, service_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUBMITTED','PENDING_INFO','DENIED','APPEALED','RESUBMITTED','PAID','CLOSED')),
  denial_code TEXT, denial_reason TEXT, assigned_to TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS billing_tasks (
  id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id),
  kind TEXT NOT NULL CHECK (kind IN ('AUTH_DOCUMENTATION','CODING_REVIEW','PAYER_CALL','APPEAL_PREP')),
  note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), turn_id TEXT NOT NULL, tool TEXT NOT NULL,
  args_json TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PROPOSED', result_json TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, user_id TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, fingerprint TEXT);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_id TEXT, actor_role TEXT, kind TEXT NOT NULL,
  security INTEGER NOT NULL DEFAULT 0, turn_id TEXT, detail_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS traces (turn_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, at TEXT NOT NULL, steps_json TEXT NOT NULL, decision_json TEXT);
CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, day TEXT NOT NULL, model TEXT NOT NULL, purpose TEXT NOT NULL,
  cost_usd REAL NOT NULL, tokens_in INTEGER, tokens_out INTEGER, latency_ms INTEGER, ok INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS lab_results (lab TEXT PRIMARY KEY, at TEXT NOT NULL, results_json TEXT NOT NULL);
