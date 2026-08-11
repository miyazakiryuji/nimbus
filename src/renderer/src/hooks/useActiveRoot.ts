import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'

/**
 * いま操作対象になっているディレクトリ。
 * アクティブセッションの cwd（タスクの worktree を含む）を優先し、
 * なければ開いているワークスペース。エクスプローラー・レビュー・表示ラベルで共有する。
 */
export function useActiveRoot(): string | null {
  const workspace = useUiStore((s) => s.workspace)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  const activeInit = activeSessionId
    ? sessions[activeSessionId]?.events.find((e) => e.kind === 'session-init')
    : undefined
  const sessionCwd = activeInit && 'cwd' in activeInit ? activeInit.cwd : null
  return sessionCwd ?? workspace
}
