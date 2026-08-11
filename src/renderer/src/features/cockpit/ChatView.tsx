import { useCallback, useEffect, useRef, useState } from 'react'
import type { NimbusEvent } from '@shared/events'
import { TERMINAL_STATUSES, useSessionStore } from '../../stores/sessionStore'
import { useUiStore } from '../../stores/uiStore'

function EventRow({ event }: { event: NimbusEvent }): React.JSX.Element | null {
  switch (event.kind) {
    case 'user-text':
      return <div className="msg msg-user">{event.text}</div>
    case 'assistant-text':
      return <div className="msg msg-assistant">{event.text}</div>
    case 'assistant-thinking':
      return <div className="msg msg-thinking">{event.text}</div>
    case 'tool-use':
      return (
        <div className="msg msg-tool">
          ⚙ {event.toolName}
          <span className="msg-tool-detail"> {JSON.stringify(event.input)?.slice(0, 120)}</span>
        </div>
      )
    case 'tool-result':
      return (
        <div className={`msg msg-tool ${event.isError ? 'msg-tool-error' : ''}`}>
          ↳ {event.preview.slice(0, 120)}
        </div>
      )
    case 'turn-result':
      return (
        <div className="msg msg-meta">
          ── {event.subtype} / {event.numTurns} turns / {(event.durationMs / 1000).toFixed(1)}s
          {event.totalCostUsd !== undefined && ` / $${event.totalCostUsd.toFixed(4)} (累積)`}
        </div>
      )
    case 'session-error':
      return <div className="msg msg-error">エラー: {event.message}</div>
    case 'session-init':
      return (
        <div className="msg msg-meta">
          ● セッション開始 — {event.model} / {event.apiKeySource} / {event.cwd}
        </div>
      )
    default:
      return null
  }
}

function ChatView(): React.JSX.Element {
  // セッションの購読・再アタッチは App の useSessionSync が全ビュー共通で行う
  const { sessions, activeSessionId, hydrated } = useSessionStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uiError, setUiError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const active = activeSessionId ? sessions[activeSessionId] : undefined
  const activeIsTerminal = active ? TERMINAL_STATUSES.has(active.status) : false

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [active?.events.length])

  const setActive = useSessionStore((s) => s.setActive)

  const handleSend = useCallback(async (): Promise<void> => {
    const text = input.trim()
    if (!text || sending || !hydrated) return
    setSending(true)
    setInput('')
    setUiError(null)
    try {
      if (active && !activeIsTerminal) {
        await window.nimbus.sessions.send({ sessionId: active.sessionId, text })
      } else {
        // 新規セッションは開いているワークスペースを cwd にする（IDE 化）
        const workspace = useUiStore.getState().workspace
        const created = await window.nimbus.sessions.create({
          firstMessage: text,
          ...(workspace ? { cwd: workspace } : {})
        })
        // 旧セッションを表示中でも、新規作成したセッションへ表示を切り替える
        setActive(created.sessionId)
      }
    } catch (error) {
      console.error('[nimbus:renderer] send failed', error)
      setUiError('送信に失敗しました。セッションが終了している可能性があります。')
    } finally {
      setSending(false)
    }
  }, [input, sending, hydrated, active, activeIsTerminal, setActive])

  const handleInterrupt = useCallback(async (): Promise<void> => {
    if (!active) return
    try {
      await window.nimbus.sessions.interrupt({ sessionId: active.sessionId })
    } catch (error) {
      console.error('[nimbus:renderer] interrupt failed', error)
      setUiError('中断に失敗しました。')
    }
  }, [active])

  return (
    <div className="chat">
      <header className="chat-header">
        <span className="chat-title">Nimbus</span>
        {active && (
          <span className="chat-session-info">
            {active.model ?? '…'} / {active.status}
            {active.totalCostUsd !== undefined && ` / $${active.totalCostUsd.toFixed(4)}`}
          </span>
        )}
      </header>
      <div className="chat-log" ref={scrollRef}>
        {!active && <p className="chat-empty">メッセージを送るとセッションが始まります</p>}
        {active?.events.map((event, i) => (
          <EventRow key={i} event={event} />
        ))}
        {uiError && <p className="msg msg-error">{uiError}</p>}
      </div>
      <footer className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          placeholder="Claude への指示を入力（Cmd/Ctrl+Enter で送信）"
          rows={3}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSend()
            }
          }}
        />
        <div className="chat-buttons">
          <button
            className="btn btn-primary"
            onClick={() => void handleSend()}
            disabled={sending || !hydrated}
          >
            送信
          </button>
          <button
            className="btn"
            onClick={() => void handleInterrupt()}
            disabled={!active || active.status !== 'running'}
          >
            中断
          </button>
        </div>
      </footer>
    </div>
  )
}

export default ChatView
