import DatabaseConstructor from 'better-sqlite3'
import type { Database } from 'better-sqlite3'
import { nimbusEventSchema } from '@shared/events'
import type { NimbusEvent, PersistedSession, SessionSummary } from '@shared/events'
import type { KanbanTask } from '@shared/tasks'
import { migrate } from './schema'

/**
 * 永続化ストア（§3: better-sqlite3 / WAL / メインプロセス単一書き込み点）。
 * §6-2: 書き込みは必ず sanitize を通す。このクラスの外から直接 DB に書いてはならない。
 */
export class Store {
  private db: Database

  constructor(
    dbPath: string,
    private readonly sanitize: (s: string) => string
  ) {
    this.db = new DatabaseConstructor(dbPath)
    this.db.pragma('journal_mode = WAL')
    migrate(this.db)
  }

  /** イベントを記録し、セッション行・コスト行を同一トランザクションで更新する */
  record(event: NimbusEvent, summary: SessionSummary | undefined): void {
    const tx = this.db.transaction(() => {
      if (summary) {
        this.db
          .prepare(
            `INSERT INTO sessions (session_id, claude_session_id, cwd, model, status, created_at, updated_at, total_cost_usd)
             VALUES (@sessionId, @claudeSessionId, @cwd, @model, @status, @createdAt, @updatedAt, @totalCostUsd)
             ON CONFLICT(session_id) DO UPDATE SET
               claude_session_id = excluded.claude_session_id,
               model = excluded.model,
               status = excluded.status,
               updated_at = excluded.updated_at,
               total_cost_usd = excluded.total_cost_usd`
          )
          .run({
            sessionId: summary.sessionId,
            claudeSessionId: summary.claudeSessionId ?? null,
            cwd: this.sanitize(summary.cwd),
            model: summary.model ?? null,
            status: summary.status,
            createdAt: summary.createdAt,
            updatedAt: Date.now(),
            totalCostUsd: summary.totalCostUsd ?? null
          })
      }
      this.db
        .prepare('INSERT INTO events (session_id, kind, timestamp, payload) VALUES (?, ?, ?, ?)')
        .run(event.sessionId, event.kind, event.timestamp, this.sanitize(JSON.stringify(event)))
      if (event.kind === 'turn-result' && event.totalCostUsd !== undefined) {
        this.db
          .prepare(
            `INSERT INTO costs (session_id, timestamp, total_cost_usd, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            event.sessionId,
            event.timestamp,
            event.totalCostUsd,
            event.usage?.inputTokens ?? null,
            event.usage?.outputTokens ?? null,
            event.usage?.cacheCreationInputTokens ?? null,
            event.usage?.cacheReadInputTokens ?? null
          )
      }
    })
    tx()
  }

  touchWorkspace(path: string): void {
    this.db
      .prepare(
        `INSERT INTO workspaces (path, last_used_at) VALUES (?, ?)
         ON CONFLICT(path) DO UPDATE SET last_used_at = excluded.last_used_at`
      )
      .run(this.sanitize(path), Date.now())
  }

  listSessions(): PersistedSession[] {
    interface Row {
      session_id: string
      claude_session_id: string | null
      cwd: string
      model: string | null
      status: string
      created_at: number
      updated_at: number
      total_cost_usd: number | null
    }
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as Row[]
    return rows.map((r) => ({
      sessionId: r.session_id,
      claudeSessionId: r.claude_session_id ?? undefined,
      cwd: r.cwd,
      model: r.model ?? undefined,
      status: r.status as PersistedSession['status'],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      totalCostUsd: r.total_cost_usd ?? undefined
    }))
  }

  getSession(sessionId: string): PersistedSession | undefined {
    return this.listSessions().find((s) => s.sessionId === sessionId)
  }

  getEvents(sessionId: string): NimbusEvent[] {
    const rows = this.db
      .prepare('SELECT payload FROM events WHERE session_id = ? ORDER BY id ASC')
      .all(sessionId) as Array<{ payload: string }>
    const events: NimbusEvent[] = []
    for (const row of rows) {
      try {
        const parsed = nimbusEventSchema.safeParse(JSON.parse(row.payload))
        if (parsed.success) events.push(parsed.data)
      } catch {
        // 壊れた行は読み飛ばす（書き込み時に検証済みのため通常は起きない）
      }
    }
    return events
  }

  upsertTask(task: KanbanTask): void {
    this.db
      .prepare(
        `INSERT INTO tasks (task_id, title, repo_cwd, worktree_path, branch, prompt, session_id, state, created_at, updated_at)
         VALUES (@taskId, @title, @repoCwd, @worktreePath, @branch, @prompt, @sessionId, @state, @createdAt, @updatedAt)
         ON CONFLICT(task_id) DO UPDATE SET
           session_id = excluded.session_id,
           state = excluded.state,
           updated_at = excluded.updated_at`
      )
      .run({
        taskId: task.taskId,
        title: this.sanitize(task.title),
        repoCwd: this.sanitize(task.repoCwd),
        worktreePath: task.worktreePath,
        branch: task.branch,
        prompt: this.sanitize(task.prompt),
        sessionId: task.sessionId ?? null,
        state: task.state,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      })
  }

  listWorkspaces(): string[] {
    const rows = this.db
      .prepare('SELECT path FROM workspaces ORDER BY last_used_at DESC')
      .all() as Array<{ path: string }>
    return rows.map((r) => r.path)
  }

  listTasks(): KanbanTask[] {
    interface Row {
      task_id: string
      title: string
      repo_cwd: string
      worktree_path: string
      branch: string
      prompt: string
      session_id: string | null
      state: string
      created_at: number
      updated_at: number
    }
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all() as Row[]
    return rows.map((r) => ({
      taskId: r.task_id,
      title: r.title,
      repoCwd: r.repo_cwd,
      worktreePath: r.worktree_path,
      branch: r.branch,
      prompt: r.prompt,
      sessionId: r.session_id ?? undefined,
      state: r.state as KanbanTask['state'],
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
  }

  /**
   * 前回起動時に実行中のまま残ったセッションを 'interrupted' へ倒す
   * （アプリ再起動後に「実行中」と誤表示しないため）
   */
  reconcileDanglingSessions(): void {
    this.db
      .prepare(
        `UPDATE sessions SET status = 'interrupted', updated_at = ?
         WHERE status NOT IN ('completed', 'error', 'interrupted')`
      )
      .run(Date.now())
  }

  close(): void {
    this.db.close()
  }
}
