import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { approvalSummarySchema, type ApprovalSummary } from '@shared/approvals'
import { useSessionStore } from '../../stores/sessionStore'

const listSchema = z.array(approvalSummarySchema)

/**
 * F-3 承認インボックス。全セッション横断のキューをコックピット上部に表示する。
 * まとめて承認 / 個別承認 / 拒否 / 「このツールは以後自動承認」（セッション・ワークスペース単位）。
 */
function InboxBanner(): React.JSX.Element | null {
  const [approvals, setApprovals] = useState<ApprovalSummary[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const sessions = useSessionStore((s) => s.sessions)

  useEffect(() => {
    const apply = (raw: unknown): void => {
      const parsed = listSchema.safeParse(raw)
      if (parsed.success) {
        setApprovals(parsed.data)
        if (import.meta.env.DEV) {
          console.log(`[nimbus:renderer] approvals pending=${parsed.data.length}`)
        }
      }
    }
    void window.nimbus.approvals.list().then(apply)
    return window.nimbus.approvals.onChanged(apply)
  }, [])

  const act = useCallback(
    async (
      action: 'approve' | 'deny',
      ids: string[],
      always?: 'session' | 'workspace'
    ): Promise<void> => {
      try {
        if (action === 'approve') {
          await window.nimbus.approvals.approve({ ids, always })
        } else {
          await window.nimbus.approvals.deny({ ids })
        }
      } catch (error) {
        console.error('[nimbus:renderer] approval action failed', error)
      }
    },
    []
  )

  if (approvals.length === 0) return null

  const sessionLabel = (a: ApprovalSummary): string => {
    const model = sessions[a.sessionId]?.model
    return `${a.cwd.split('/').pop() ?? a.cwd}${model ? ` (${model})` : ''}`
  }

  return (
    <div className="inbox">
      <div className="inbox-header">
        <span className="inbox-title">⏸ 承認待ち {approvals.length} 件</span>
        <span className="inbox-header-actions">
          <button
            className="btn btn-small btn-primary"
            onClick={() =>
              void act(
                'approve',
                approvals.map((a) => a.id)
              )
            }
          >
            まとめて承認
          </button>
          <button
            className="btn btn-small"
            onClick={() =>
              void act(
                'deny',
                approvals.map((a) => a.id)
              )
            }
          >
            まとめて拒否
          </button>
        </span>
      </div>
      <ul className="inbox-list">
        {approvals.map((a) => (
          <li key={a.id} className="inbox-row">
            <div className="inbox-row-main">
              <span className="inbox-tool">{a.toolName}</span>
              {a.targetPath && <span className="inbox-target">{a.targetPath}</span>}
              <span className="inbox-session">{sessionLabel(a)}</span>
            </div>
            <div className="inbox-row-actions">
              <button
                className="btn btn-small btn-primary"
                onClick={() => void act('approve', [a.id])}
              >
                承認
              </button>
              <button
                className="btn btn-small"
                onClick={() => void act('approve', [a.id], 'session')}
                title="このセッションでは同じツールを以後自動承認"
              >
                承認+セッション
              </button>
              <button
                className="btn btn-small"
                onClick={() => void act('approve', [a.id], 'workspace')}
                title="このワークスペースでは同じツールを以後自動承認"
              >
                承認+WS
              </button>
              <button className="btn btn-small" onClick={() => void act('deny', [a.id])}>
                拒否
              </button>
              <button
                className="btn btn-small"
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
              >
                {expanded === a.id ? '閉じる' : '詳細'}
              </button>
            </div>
            {expanded === a.id && <pre className="inbox-preview">{a.inputPreview}</pre>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default InboxBanner
