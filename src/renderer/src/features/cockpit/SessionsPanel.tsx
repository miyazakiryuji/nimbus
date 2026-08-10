import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { nimbusEventSchema, persistedSessionSchema } from '@shared/events'
import type { PersistedSession } from '@shared/events'
import { useSessionStore } from '../../stores/sessionStore'

const historySchema = z.array(persistedSessionSchema)
const eventsSchema = z.array(nimbusEventSchema)

function shortPath(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function SessionsPanel(): React.JSX.Element {
  const { sessions, activeSessionId, setActive, loadEvents } = useSessionStore()
  const [history, setHistory] = useState<PersistedSession[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const raw = await window.nimbus.sessions.history()
      const parsed = historySchema.safeParse(raw)
      if (parsed.success) {
        setHistory(parsed.data)
      } else {
        console.error('[nimbus:renderer] invalid history', parsed.error)
      }
    } catch (error) {
      console.error('[nimbus:renderer] history failed', error)
    }
  }, [])

  useEffect(() => {
    // 外部システム（main プロセスの DB）からの取得。setHistory は await 後の
    // 非同期コールバックでのみ呼ばれるため cascading render は起きない
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh, activeSessionId])

  const handleSelect = useCallback(
    async (row: PersistedSession): Promise<void> => {
      if (busy) return
      // ライブセッションなら表示切替のみ
      if (sessions[row.sessionId] && sessions[row.sessionId].events.length > 0) {
        setActive(row.sessionId)
        return
      }
      setBusy(true)
      try {
        // 過去セッション: 履歴をロードしてから再アタッチ（同一 Nimbus ID で再開）
        const rawEvents = await window.nimbus.sessions.events({ sessionId: row.sessionId })
        const parsedEvents = eventsSchema.safeParse(rawEvents)
        await window.nimbus.sessions.resume({ sessionId: row.sessionId })
        if (parsedEvents.success) {
          loadEvents(row.sessionId, parsedEvents.data)
        }
        setActive(row.sessionId)
      } catch (error) {
        console.error('[nimbus:renderer] resume failed', error)
      } finally {
        setBusy(false)
      }
    },
    [busy, sessions, setActive, loadEvents]
  )

  return (
    <aside className="sessions-panel">
      <div className="sessions-panel-header">
        <span>セッション</span>
        <button className="btn btn-small" onClick={() => setActive(null)}>
          ＋ 新規
        </button>
      </div>
      <ul className="sessions-list">
        {history.map((row) => {
          const live = sessions[row.sessionId]
          const status = live?.status ?? row.status
          const cost = live?.totalCostUsd ?? row.totalCostUsd
          return (
            <li key={row.sessionId}>
              <button
                className={`session-row ${row.sessionId === activeSessionId ? 'session-row-active' : ''}`}
                onClick={() => void handleSelect(row)}
                disabled={busy}
              >
                <span className="session-row-title">{shortPath(row.cwd)}</span>
                <span className="session-row-meta">
                  {status}
                  {cost !== undefined && ` · $${cost.toFixed(3)}`}
                </span>
              </button>
            </li>
          )
        })}
        {history.length === 0 && <li className="sessions-empty">履歴はまだありません</li>}
      </ul>
    </aside>
  )
}

export default SessionsPanel
