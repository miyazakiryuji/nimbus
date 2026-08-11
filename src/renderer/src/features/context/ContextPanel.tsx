import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { NimbusEvent } from '@shared/events'
import { claudeMdEntrySchema } from '@shared/ipc-schemas'
import { useSessionStore } from '../../stores/sessionStore'
import { toBarHeights, toSparklinePoints } from './sparkline'

const claudeMdListSchema = z.array(claudeMdEntrySchema)
type ClaudeMdEntry = z.infer<typeof claudeMdEntrySchema>

const SCOPE_LABELS: Record<ClaudeMdEntry['scope'], string> = {
  user: 'ユーザー',
  parent: '親ディレクトリ',
  project: 'プロジェクト'
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="ctx-section">
      <h4 className="ctx-title">{title}</h4>
      {children}
    </section>
  )
}

function ContextPanel(): React.JSX.Element {
  const { sessions, activeSessionId } = useSessionStore()
  // sessionId キーの辞書で持つ（§3 原則 5。同期 setState によるクリアも不要になる）
  const [claudeMdBySession, setClaudeMdBySession] = useState<Record<string, ClaudeMdEntry[]>>({})
  const active = activeSessionId ? sessions[activeSessionId] : undefined
  const claudeMd = (activeSessionId ? claudeMdBySession[activeSessionId] : undefined) ?? []

  const init = active?.events.findLast?.(
    (e): e is Extract<NimbusEvent, { kind: 'session-init' }> => e.kind === 'session-init'
  )

  useEffect(() => {
    if (!activeSessionId) return
    const sessionId = activeSessionId
    let cancelled = false
    void window.nimbus.context
      .claudeMd({ sessionId })
      .then((raw) => {
        const parsed = claudeMdListSchema.safeParse(raw)
        if (!cancelled && parsed.success) {
          setClaudeMdBySession((prev) => ({ ...prev, [sessionId]: parsed.data }))
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [activeSessionId, init?.timestamp])

  if (!active) {
    return <aside className="context-panel context-panel-empty">セッション未選択</aside>
  }

  const turnResults = active.events.filter(
    (e): e is Extract<NimbusEvent, { kind: 'turn-result' }> => e.kind === 'turn-result'
  )
  const costSeries = turnResults
    .map((t) => t.totalCostUsd)
    .filter((v): v is number => v !== undefined)
  const tokenSeries = turnResults.map(
    (t) => (t.usage?.inputTokens ?? 0) + (t.usage?.outputTokens ?? 0)
  )
  const barHeights = toBarHeights(tokenSeries)

  return (
    <aside className="context-panel">
      <Section title="セッション">
        <dl className="ctx-kv">
          <dt>モデル</dt>
          <dd>{init?.model ?? '…'}</dd>
          <dt>Claude Code</dt>
          <dd>{init?.claudeCodeVersion ?? '…'}</dd>
          <dt>認証</dt>
          <dd>{init?.apiKeySource ?? '…'}</dd>
          <dt>権限モード</dt>
          <dd>{init?.permissionMode ?? '…'}</dd>
          <dt>cwd</dt>
          <dd className="ctx-path">{init?.cwd ?? active.sessionId}</dd>
        </dl>
      </Section>

      <Section title={`ツール (${init?.tools.length ?? 0})`}>
        <p className="ctx-list">{init?.tools.join(', ') || '—'}</p>
      </Section>

      <Section title={`MCP サーバー (${init?.mcpServers.length ?? 0})`}>
        {(init?.mcpServers ?? []).map((s) => (
          <p key={s.name} className="ctx-list">
            {s.name} <span className="ctx-muted">({s.status})</span>
          </p>
        ))}
        {(init?.mcpServers.length ?? 0) === 0 && <p className="ctx-muted">なし</p>}
      </Section>

      <Section
        title={`プラグイン (${init?.plugins.length ?? 0}) / スキル (${init?.skills.length ?? 0})`}
      >
        <p className="ctx-list">
          {[
            ...(init?.plugins.map((p) => p.name + (p.version ? `@${p.version}` : '')) ?? []),
            ...(init?.skills ?? [])
          ].join(', ') || '—'}
        </p>
      </Section>

      <Section title={`CLAUDE.md 階層 (${claudeMd.length})`}>
        {claudeMd.map((e) => (
          <p key={e.path} className="ctx-list ctx-path">
            <span className="ctx-scope">{SCOPE_LABELS[e.scope]}</span> {e.path}
          </p>
        ))}
        {claudeMd.length === 0 && <p className="ctx-muted">適用なし</p>}
      </Section>

      <Section title="コスト / トークン推移">
        <p className="ctx-cost">
          累積 {active.totalCostUsd !== undefined ? `$${active.totalCostUsd.toFixed(4)}` : '—'}
          <span className="ctx-muted">（推定値・正式請求額ではありません）</span>
        </p>
        {costSeries.length > 1 && (
          <svg className="ctx-chart" viewBox="0 0 200 40" preserveAspectRatio="none">
            <polyline
              points={toSparklinePoints(costSeries, 200, 38)}
              fill="none"
              stroke="var(--nimbus-color-accent)"
              strokeWidth="2"
            />
          </svg>
        )}
        {tokenSeries.length > 0 && (
          <div className="ctx-bars" title="ターンごとの入出力トークン合計">
            {barHeights.map((h, i) => (
              <div
                key={i}
                className="ctx-bar"
                style={{ height: `${Math.max(2, h * 36)}px` }}
                title={`${tokenSeries[i]} tokens`}
              />
            ))}
          </div>
        )}
        {tokenSeries.length === 0 && <p className="ctx-muted">まだターンがありません</p>}
      </Section>
    </aside>
  )
}

export default ContextPanel
