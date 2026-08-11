import type { Database } from 'better-sqlite3'

/**
 * マイグレーション。配列に SQL を追記していく方式（user_version で管理）。
 * 過去エントリの書き換えは禁止。
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    claude_session_id TEXT,
    cwd TEXT NOT NULL,
    model TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    total_cost_usd REAL
  );
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE INDEX idx_events_session ON events(session_id, id);
  CREATE TABLE costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    total_cost_usd REAL NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_creation_input_tokens INTEGER,
    cache_read_input_tokens INTEGER
  );
  CREATE INDEX idx_costs_session ON costs(session_id, id);
  CREATE TABLE workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    last_used_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE tasks (
    task_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    repo_cwd TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    branch TEXT NOT NULL,
    prompt TEXT NOT NULL,
    session_id TEXT,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `
]

export function migrate(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i])
      db.pragma(`user_version = ${i + 1}`)
    })()
  }
}
