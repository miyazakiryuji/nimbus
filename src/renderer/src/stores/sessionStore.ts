import { create } from 'zustand'
import type { NimbusEvent, SessionStatus } from '@shared/events'

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

interface SessionStoreState {
  sessions: Record<string, SessionViewState>
  activeSessionId: string | null
  ingest: (event: NimbusEvent) => void
  setActive: (sessionId: string) => void
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: {},
  activeSessionId: null,

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
        // 累積値仕様（§10 検証）: 合算せず最新値で上書き
        updated.totalCostUsd = event.totalCostUsd
      }
      return {
        sessions: { ...state.sessions, [event.sessionId]: updated },
        // 最初に観測したセッションを自動でアクティブにする（Phase 1 の単一表示用）
        activeSessionId: state.activeSessionId ?? event.sessionId
      }
    }),

  setActive: (sessionId) => set({ activeSessionId: sessionId })
}))
