import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function openDb(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // forward-only migration for databases created before the decision summary existed
  if (!db.prepare('PRAGMA table_info(traces)').all().some(c => c.name === 'decision_json')) db.exec('ALTER TABLE traces ADD COLUMN decision_json TEXT');
  if (!db.prepare('PRAGMA table_info(idempotency_keys)').all().some(c => c.name === 'fingerprint')) db.exec('ALTER TABLE idempotency_keys ADD COLUMN fingerprint TEXT');
  return db;
}
