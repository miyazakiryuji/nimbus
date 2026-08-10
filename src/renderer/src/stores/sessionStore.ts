import { create } from 'zustand'
import type { NimbusEvent, SessionStatus, SessionSummary } from '@shared/events'

/**
 * セッション状態ストア。
 * §3 設計原則 5: 内部状態は最初から sessionId をキーにした辞書で持つ。
 * Phase 1 の単一セッション UI は activeSessionId で「表示を 1 つ選ぶ」だけ。
 */
export interface SessionViewState {
  sessionId: string
  status: SessionStatus
  model?: string
  claudeSessionId?: string
  totalCostUsd?: number
  events: NimbusEvent[]
}

export const TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set(['completed', 'error'])

interface SessionStoreState {
  sessions: Record<string, SessionViewState>
  activeSessionId: string | null
  hydrated: boolean
  ingest: (event: NimbusEvent) => void
  /** リロード/再オープン時に main の list() から既存セッションを取り込む（重複生成防止） */
  hydrate: (summaries: SessionSummary[]) => void
  /** DB から読んだ過去イベントを先頭にマージする（resume 時の履歴表示） */
  loadEvents: (sessionId: string, history: NimbusEvent[]) => void
  setActive: (sessionId: string | null) => void
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: {},
  activeSessionId: null,
  hydrated: false,

  ingest: (event) =>
    set((state) => {
      const existing = state.sessions[event.sessionId] ?? {
        sessionId: event.sessionId,
        status: 'starting' as SessionStatus,
        events: []
      }
      const updated: SessionViewState = {
        ...existing,
        events: [...existing.events, event]
      }
      if (event.kind === 'session-init') {
        updated.model = event.model
        updated.claudeSessionId = event.claudeSessionId
      } else if (event.kind === 'status') {
        updated.status = event.status
      } else if (event.kind === 'turn-result' && event.totalCostUsd !== undefined) {
        // 累積値仕様（§10 検証）: 合算せず最新値。ただしクラッシュ系のゼロで後退させない
        updated.totalCostUsd = Math.max(updated.totalCostUsd ?? 0, event.totalCostUsd)
      }
      return {
        sessions: { ...state.sessions, [event.sessionId]: updated },
        // 最初に観測したセッションを自動でアクティブにする（Phase 1 の単一表示用）
        activeSessionId: state.activeSessionId ?? event.sessionId
      }
    }),

  hydrate: (summaries) =>
    set((state) => {
      const sessions = { ...state.sessions }
      for (const summary of summaries) {
        const existing = sessions[summary.sessionId]
        sessions[summary.sessionId] = {
          sessionId: summary.sessionId,
          status: summary.status,
          model: summary.model,
          claudeSessionId: summary.claudeSessionId,
          totalCostUsd: summary.totalCostUsd,
          // 既にイベントを受けていればそれを保持（hydrate はメタデータ補完のみ）
          events: existing?.events ?? []
        }
      }
      // 非 terminal の最新セッションをアクティブにする（重複 create 防止）
      const resumable = summaries
        .filter((s) => !TERMINAL_STATUSES.has(s.status))
        .sort((a, b) => b.createdAt - a.createdAt)
      return {
        sessions,
        hydrated: true,
        activeSessionId: state.activeSessionId ?? resumable[0]?.sessionId ?? null
      }
    }),

  loadEvents: (sessionId, history) =>
    set((state) => {
      const existing = state.sessions[sessionId] ?? {
        sessionId,
        status: 'starting' as SessionStatus,
        events: []
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            // 履歴を先頭に、ライブイベントを後ろに（resume 直後の呼び出しを想定）
            events: [...history, ...existing.events]
          }
        }
      }
    }),

  setActive: (sessionId) => set({ activeSessionId: sessionId })
}))
