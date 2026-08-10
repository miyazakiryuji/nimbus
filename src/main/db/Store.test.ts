import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DatabaseConstructor from 'better-sqlite3'
import type { NimbusEvent, SessionSummary } from '@shared/events'
import { createSanitizer } from '../services/sanitizer'
import { Store } from './Store'

const SESSION_ID = '22222222-2222-4222-8222-222222222222'

const summary = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: SESSION_ID,
  status: 'running',
  cwd: '/tmp/project',
  createdAt: 1000,
  ...over
})

const userText = (text: string): NimbusEvent => ({
  kind: 'user-text',
  sessionId: SESSION_ID,
  timestamp: 2000,
  text
})

describe('Store', () => {
  let dir: string
  let dbPath: string
  let store: Store

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nimbus-store-'))
    dbPath = join(dir, 'test.db')
    store = new Store(dbPath, createSanitizer({}).sanitizeString)
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('WAL モードで開かれる（§3: 多重セッションの同時追記前提）', () => {
    const raw = new DatabaseConstructor(dbPath)
    expect(raw.pragma('journal_mode', { simple: true })).toBe('wal')
    raw.close()
  })

  it('record でセッション行が upsert され、listSessions で取得できる', () => {
    store.record(userText('hello'), summary())
    store.record(userText('again'), summary({ model: 'claude-fable-5', totalCostUsd: 0.2 }))
    const sessions = store.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: SESSION_ID,
      model: 'claude-fable-5',
      totalCostUsd: 0.2,
      cwd: '/tmp/project'
    })
  })

  it('イベントが roundtrip し、順序が保持される', () => {
    store.record(userText('first'), summary())
    store.record(
      { kind: 'assistant-text', sessionId: SESSION_ID, timestamp: 3000, text: 'reply' },
      summary()
    )
    const events = store.getEvents(SESSION_ID)
    expect(events.map((e) => e.kind)).toEqual(['user-text', 'assistant-text'])
  })

  it('§6-2: 保存前にサニタイザが適用される（DB の生データにも秘密が残らない）', () => {
    store.record(userText('my key is sk-ant-api03-abcDEF123456789xyz'), summary())
    // 読み出し API 経由
    const events = store.getEvents(SESSION_ID)
    expect(events[0]).toMatchObject({ text: 'my key is [REDACTED:anthropic-key]' })
    // DB の生バイトにも残っていないこと
    const raw = new DatabaseConstructor(dbPath)
    const row = raw.prepare('SELECT payload FROM events').get() as { payload: string }
    raw.close()
    expect(row.payload).not.toContain('sk-ant-')
    expect(row.payload).toContain('[REDACTED:anthropic-key]')
  })

  it('turn-result で costs 行が追加される', () => {
    store.record(
      {
        kind: 'turn-result',
        sessionId: SESSION_ID,
        timestamp: 4000,
        subtype: 'success',
        isError: false,
        numTurns: 1,
        durationMs: 100,
        totalCostUsd: 0.5,
        usage: { inputTokens: 10, outputTokens: 5 }
      },
      summary()
    )
    const raw = new DatabaseConstructor(dbPath)
    const row = raw.prepare('SELECT * FROM costs').get() as Record<string, unknown>
    raw.close()
    expect(row).toMatchObject({
      session_id: SESSION_ID,
      total_cost_usd: 0.5,
      input_tokens: 10,
      output_tokens: 5
    })
  })

  it('summary 不在（未知セッション）でもイベント自体は記録される', () => {
    store.record(userText('orphan'), undefined)
    expect(store.getEvents(SESSION_ID)).toHaveLength(1)
    expect(store.listSessions()).toHaveLength(0)
  })

  it('reconcileDanglingSessions: 実行中のまま残った行を interrupted に倒す', () => {
    store.record(userText('x'), summary({ status: 'running' }))
    store.reconcileDanglingSessions()
    expect(store.getSession(SESSION_ID)?.status).toBe('interrupted')
    // terminal は変更しない
    store.record(userText('y'), summary({ status: 'completed' }))
    store.reconcileDanglingSessions()
    expect(store.getSession(SESSION_ID)?.status).toBe('completed')
  })

  it('workspaces が upsert される', () => {
    store.touchWorkspace('/tmp/project')
    store.touchWorkspace('/tmp/project')
    const raw = new DatabaseConstructor(dbPath)
    const rows = raw.prepare('SELECT path FROM workspaces').all()
    raw.close()
    expect(rows).toHaveLength(1)
  })
})
