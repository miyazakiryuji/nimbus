import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { KANBAN_COLUMNS, taskSchema, type KanbanTask } from '@shared/tasks'
import type { NimbusEvent } from '@shared/events'
import { useSessionStore } from '../../stores/sessionStore'
import { useUiStore } from '../../stores/uiStore'

const taskListSchema = z.array(taskSchema)

function eventSummary(event: NimbusEvent): string | null {
  switch (event.kind) {
    case 'user-text':
      return `👤 ${event.text.slice(0, 60)}`
    case 'assistant-text':
      return `🤖 ${event.text.slice(0, 60)}`
    case 'tool-use':
      return `⚙ ${event.toolName}`
    case 'turn-result':
      return `── ${event.subtype}`
    case 'session-error':
      return `❌ ${event.message.slice(0, 60)}`
    default:
      return null
  }
}

/**
 * F-5 カンバン: タスク＝worktree＝セッションの俯瞰。
 * 右側にセッション横断のイベントフィード。
 */
function BoardView(): React.JSX.Element {
  const { sessions, setActive } = useSessionStore()
  const { workspace, setView } = useUiStore()
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const apply = (raw: unknown): void => {
      const parsed = taskListSchema.safeParse(raw)
      if (parsed.success) setTasks(parsed.data)
    }
    void window.nimbus.tasks.list().then(apply)
    return window.nimbus.tasks.onChanged(apply)
  }, [])

  const handleCreate = useCallback(async (): Promise<void> => {
    if (!workspace) {
      setMessage('先にステータスバーの「フォルダを開く」でワークスペースを選択してください')
      return
    }
    if (!title.trim() || !prompt.trim()) return
    setMessage(null)
    try {
      await window.nimbus.tasks.create({
        title: title.trim(),
        prompt: prompt.trim(),
        repoCwd: workspace,
        autoStart: true
      })
      setTitle('')
      setPrompt('')
      setShowForm(false)
    } catch (error) {
      setMessage(`作成に失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [workspace, title, prompt])

  const handleStart = useCallback(async (task: KanbanTask): Promise<void> => {
    const result = await window.nimbus.tasks.start({ taskId: task.taskId })
    if (!result.started && result.reason) setMessage(result.reason)
  }, [])

  const handleOpen = useCallback(
    (task: KanbanTask): void => {
      if (!task.sessionId) return
      setActive(task.sessionId)
      setView('cockpit')
    },
    [setActive, setView]
  )

  const handleComplete = useCallback(async (task: KanbanTask): Promise<void> => {
    if (
      !confirm(
        `「${task.title}」を完了します。worktree は破棄されます（ブランチ ${task.branch} は残ります）。よろしいですか？`
      )
    )
      return
    try {
      await window.nimbus.tasks.complete({ taskId: task.taskId })
    } catch (error) {
      setMessage(`完了に失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  // セッション横断イベントフィード（直近 30 件）
  const feed = Object.values(sessions)
    .flatMap((s) => s.events.map((e) => ({ event: e, model: s.model })))
    .sort((a, b) => b.event.timestamp - a.event.timestamp)
    .slice(0, 30)

  return (
    <div className="board">
      <div className="board-main">
        <div className="board-toolbar">
          <span className="board-title">タスクボード</span>
          <button className="btn btn-small btn-primary" onClick={() => setShowForm(!showForm)}>
            ＋ タスク
          </button>
          {message && <span className="settings-muted">{message}</span>}
        </div>
        {showForm && (
          <div className="board-form">
            <input
              value={title}
              placeholder="タスク名（worktree・ブランチ名になります）"
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              rows={3}
              value={prompt}
              placeholder="Claude への最初の指示"
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="settings-actions">
              <button className="btn btn-primary btn-small" onClick={() => void handleCreate()}>
                作成して開始
              </button>
              <button className="btn btn-small" onClick={() => setShowForm(false)}>
                キャンセル
              </button>
            </div>
          </div>
        )}
        <div className="board-columns">
          {KANBAN_COLUMNS.map((column) => {
            const columnTasks = tasks.filter((t) => t.state === column.state)
            return (
              <div key={column.state} className="board-column">
                <h4 className="board-column-title">
                  {column.label} <span className="ctx-muted">({columnTasks.length})</span>
                </h4>
                {columnTasks.map((task) => {
                  const session = task.sessionId ? sessions[task.sessionId] : undefined
                  return (
                    <div key={task.taskId} className="board-card">
                      <div className="board-card-title">{task.title}</div>
                      <div className="board-card-meta">
                        {task.branch}
                        {session?.totalCostUsd !== undefined &&
                          ` · $${session.totalCostUsd.toFixed(3)}`}
                      </div>
                      <div className="board-card-actions">
                        {task.state === 'pending' && (
                          <button
                            className="btn btn-small btn-primary"
                            onClick={() => void handleStart(task)}
                          >
                            開始
                          </button>
                        )}
                        {task.sessionId && task.state !== 'done' && (
                          <button className="btn btn-small" onClick={() => handleOpen(task)}>
                            開く
                          </button>
                        )}
                        {task.state !== 'done' && (
                          <button
                            className="btn btn-small"
                            onClick={() => void handleComplete(task)}
                          >
                            完了
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {columnTasks.length === 0 && <p className="ctx-muted board-empty">—</p>}
              </div>
            )
          })}
        </div>
      </div>
      <aside className="board-feed">
        <h4 className="ctx-title">イベントフィード（全セッション）</h4>
        {feed.map(({ event, model }, i) => {
          const summary = eventSummary(event)
          if (!summary) return null
          return (
            <div key={i} className="board-feed-item">
              <span className="ctx-muted">
                {new Date(event.timestamp).toLocaleTimeString('ja-JP')}{' '}
                {event.sessionId.slice(0, 6)}
                {model ? ` (${model.replace('claude-', '')})` : ''}
              </span>
              <div>{summary}</div>
            </div>
          )
        })}
        {feed.length === 0 && <p className="ctx-muted">まだイベントはありません</p>}
      </aside>
    </div>
  )
}

export default BoardView
