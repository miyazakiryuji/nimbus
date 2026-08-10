import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { NimbusEvent, SessionStatus, SessionSummary } from '@shared/events'
import { AsyncMessageQueue } from './AsyncMessageQueue'
import { normalizeSdkMessage } from './normalize'

interface ManagedSession {
  /** Nimbus 内部 ID（全イベント・DB のキー。SDK の session_id とは別物） */
  id: string
  claudeSessionId?: string
  status: SessionStatus
  cwd: string
  model?: string
  createdAt: number
  totalCostUsd?: number
  queue: AsyncMessageQueue<SDKUserMessage>
  handle: Query
}

export interface CreateSessionInput {
  cwd?: string
  firstMessage: string
  /** 再開時に指定する Claude セッション ID（options.resume に渡す） */
  resumeClaudeSessionId?: string
}

function userMessage(text: string): SDKUserMessage {
  // SDK 0.3.226 sdk.d.ts 実測: SDKUserMessage = { type:'user', message: MessageParam, parent_tool_use_id, ... }
  return {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null
  }
}

/**
 * Claude セッションの生成・保持・多重起動・再開（§3）。
 * 最初から Map による多重セッション管理とし、シングルトン前提の API を作らない（§3 設計原則 5）。
 */
export class SessionManager extends EventEmitter {
  private sessions = new Map<string, ManagedSession>()

  createSession(input: CreateSessionInput): string {
    const id = randomUUID()
    const cwd = input.cwd ?? process.cwd()
    const queue = new AsyncMessageQueue<SDKUserMessage>()

    const handle = query({
      prompt: queue,
      options: {
        cwd,
        // env は未指定＝親プロセス環境を継承（指定すると置換になる点に注意。§10 検証 7）
        permissionMode: 'default',
        ...(input.resumeClaudeSessionId ? { resume: input.resumeClaudeSessionId } : {})
      }
    })

    const session: ManagedSession = {
      id,
      status: 'starting',
      cwd,
      createdAt: Date.now(),
      queue,
      handle
    }
    this.sessions.set(id, session)

    this.emitEvent({
      kind: 'status',
      sessionId: id,
      timestamp: Date.now(),
      status: 'starting'
    })
    // 最初のユーザーメッセージもイベントとして正規化ストリームに流す（表示・永続化の正はメイン側）
    this.emitEvent({
      kind: 'user-text',
      sessionId: id,
      timestamp: Date.now(),
      text: input.firstMessage
    })
    queue.push(userMessage(input.firstMessage))

    void this.pump(session)
    return id
  }

  sendMessage(sessionId: string, text: string): void {
    const session = this.mustGet(sessionId)
    this.emitEvent({
      kind: 'user-text',
      sessionId,
      timestamp: Date.now(),
      text
    })
    session.queue.push(userMessage(text))
    this.setStatus(session, 'running')
  }

  async interrupt(sessionId: string): Promise<void> {
    const session = this.mustGet(sessionId)
    await session.handle.interrupt()
    this.setStatus(session, 'interrupted')
  }

  /** セッションの入力を閉じてクエリを終了させる */
  async close(sessionId: string): Promise<void> {
    const session = this.mustGet(sessionId)
    session.queue.close()
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map((s) => ({
      sessionId: s.id,
      claudeSessionId: s.claudeSessionId,
      status: s.status,
      cwd: s.cwd,
      model: s.model,
      createdAt: s.createdAt,
      totalCostUsd: s.totalCostUsd
    }))
  }

  get(sessionId: string): SessionSummary | undefined {
    const s = this.sessions.get(sessionId)
    if (!s) return undefined
    return {
      sessionId: s.id,
      claudeSessionId: s.claudeSessionId,
      status: s.status,
      cwd: s.cwd,
      model: s.model,
      createdAt: s.createdAt,
      totalCostUsd: s.totalCostUsd
    }
  }

  private async pump(session: ManagedSession): Promise<void> {
    try {
      for await (const msg of session.handle) {
        const events = normalizeSdkMessage(msg, session.id)
        for (const event of events) {
          this.applyToSessionState(session, event)
          this.emitEvent(event)
        }
      }
      if (session.status !== 'error') {
        this.setStatus(session, 'completed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emitEvent({
        kind: 'session-error',
        sessionId: session.id,
        timestamp: Date.now(),
        message
      })
      this.setStatus(session, 'error')
    }
  }

  private applyToSessionState(session: ManagedSession, event: NimbusEvent): void {
    if (event.kind === 'session-init') {
      session.claudeSessionId = event.claudeSessionId
      session.model = event.model
      if (session.status === 'starting') {
        this.setStatus(session, 'running')
      }
    } else if (event.kind === 'turn-result') {
      if (event.totalCostUsd !== undefined) {
        // 実測仕様: 累積値なので合算せず最新値で上書きする
        session.totalCostUsd = event.totalCostUsd
      }
      this.setStatus(session, 'awaiting-input')
    }
  }

  private setStatus(session: ManagedSession, status: SessionStatus): void {
    if (session.status === status) return
    session.status = status
    this.emitEvent({
      kind: 'status',
      sessionId: session.id,
      timestamp: Date.now(),
      status
    })
  }

  private emitEvent(event: NimbusEvent): void {
    this.emit('event', event)
  }

  private mustGet(sessionId: string): ManagedSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`)
    }
    return session
  }
}
