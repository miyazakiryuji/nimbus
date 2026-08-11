import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import {
  gitCheckpointSchema,
  gitFileDiffSchema,
  gitStatusResultSchema,
  type GitCheckpoint,
  type GitStatusResult
} from '@shared/review'
import { languageForPath, monaco } from './monacoSetup'
import { TERMINAL_STATUSES, useSessionStore } from '../../stores/sessionStore'
import { useUiStore } from '../../stores/uiStore'

const historySchema = z.array(gitCheckpointSchema)

const STATUS_LABELS: Record<string, string> = {
  M: '変更',
  A: '追加',
  D: '削除',
  R: '改名',
  '?': '未追跡'
}

function fileStatusLabel(index: string, workingDir: string): string {
  const code = workingDir || index
  return STATUS_LABELS[code] ?? code ?? '変更'
}

/**
 * F-4 GUI 差分レビュー。
 * 変更ファイル一覧 → Monaco diff → ファイル巻き戻し / チェックポイント / レビューコメント送信。
 */
function ReviewView(): React.JSX.Element {
  const workspace = useUiStore((s) => s.workspace)
  const themeState = useUiStore((s) => s.themeState)
  const { sessions, activeSessionId } = useSessionStore()
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [history, setHistory] = useState<GitCheckpoint[]>([])
  const [comment, setComment] = useState('')
  const [checkpointLabel, setCheckpointLabel] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

  // レビュー対象 cwd: アクティブセッションの cwd を優先（タスクの worktree を見られる）。
  // なければ開いているワークスペース（メインリポジトリ）
  const activeInit = activeSessionId
    ? sessions[activeSessionId]?.events.find((e) => e.kind === 'session-init')
    : undefined
  const sessionCwd = activeInit && 'cwd' in activeInit ? activeInit.cwd : null
  const targetCwd = sessionCwd ?? workspace

  const refresh = useCallback(async (): Promise<void> => {
    if (!targetCwd) return
    try {
      const rawStatus = await window.nimbus.git.status({ cwd: targetCwd })
      const parsed = gitStatusResultSchema.safeParse(rawStatus)
      if (parsed.success) setStatus(parsed.data)
      const rawHistory = await window.nimbus.git.history({ cwd: targetCwd })
      const parsedHistory = historySchema.safeParse(rawHistory)
      if (parsedHistory.success) setHistory(parsedHistory.data.slice(0, 10))
    } catch (error) {
      setMessage(`取得に失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [targetCwd])

  useEffect(() => {
    // 外部システム（main プロセスの git）からの取得。setState は await 後のコールバックのみ
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  // Monaco diff エディタの生成・破棄
  useEffect(() => {
    if (!containerRef.current) return
    const isDark = (themeState?.cssVars['--nimbus-color-background'] ?? '#12161f') < '#888888'
    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: true,
      renderSideBySide: true,
      automaticLayout: true,
      theme: isDark ? 'vs-dark' : 'vs',
      minimap: { enabled: false },
      fontSize: 12
    })
    editorRef.current = editor
    return () => {
      editor.getModel()?.original.dispose()
      editor.getModel()?.modified.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [themeState])

  const openDiff = useCallback(
    async (path: string): Promise<void> => {
      if (!targetCwd || !editorRef.current) return
      setSelectedFile(path)
      try {
        const raw = await window.nimbus.git.diffFile({ cwd: targetCwd, path })
        const parsed = gitFileDiffSchema.safeParse(raw)
        if (!parsed.success) return
        const language = languageForPath(path)
        const old = editorRef.current.getModel()
        editorRef.current.setModel({
          original: monaco.editor.createModel(parsed.data.before, language),
          modified: monaco.editor.createModel(parsed.data.after, language)
        })
        old?.original.dispose()
        old?.modified.dispose()
      } catch (error) {
        setMessage(`diff の取得に失敗: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    [targetCwd]
  )

  const handleRevert = useCallback(async (): Promise<void> => {
    if (!targetCwd || !selectedFile) return
    if (!confirm(`${selectedFile} を HEAD の内容へ巻き戻します。よろしいですか？`)) return
    try {
      await window.nimbus.git.revertFile({ cwd: targetCwd, path: selectedFile })
      setMessage(`${selectedFile} を巻き戻しました`)
      await refresh()
      await openDiff(selectedFile)
    } catch (error) {
      setMessage(`巻き戻しに失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [targetCwd, selectedFile, refresh, openDiff])

  const handleCheckpoint = useCallback(async (): Promise<void> => {
    if (!targetCwd) return
    // Electron の renderer では prompt() が使えないため入力欄方式
    const label = checkpointLabel.trim() || '手動チェックポイント'
    try {
      await window.nimbus.git.checkpoint({ cwd: targetCwd, label })
      setCheckpointLabel('')
      setMessage(`チェックポイント「${label}」を作成しました`)
      await refresh()
    } catch (error) {
      setMessage(`作成に失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [targetCwd, checkpointLabel, refresh])

  const handleRestore = useCallback(
    async (cp: GitCheckpoint): Promise<void> => {
      if (!targetCwd) return
      if (
        !confirm(
          `「${cp.label}」(${cp.hash.slice(0, 7)}) の状態へ復元します。\nそれ以降の変更は失われます。よろしいですか？`
        )
      )
        return
      try {
        await window.nimbus.git.restore({ cwd: targetCwd, hash: cp.hash })
        setMessage(`復元しました: ${cp.label}`)
        await refresh()
      } catch (error) {
        setMessage(`復元に失敗: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    [targetCwd, refresh]
  )

  // マージ競合（UU/AA/DD/AU/UA/DU/UD）は誤ってステージ/コミットさせない
  const isConflict = (index: string, workingDir: string): boolean =>
    index === 'U' ||
    workingDir === 'U' ||
    (index === 'A' && workingDir === 'A') ||
    (index === 'D' && workingDir === 'D')
  const allFiles = status?.files ?? []
  const conflictFiles = allFiles.filter((f) => isConflict(f.index, f.workingDir))
  // VS Code 風 SCM: ステージ済み（index 側にコードあり）と変更（working tree 側）に分ける
  const stagedFiles = allFiles.filter(
    (f) => !isConflict(f.index, f.workingDir) && f.index !== '' && f.index !== '?'
  )
  const unstagedFiles = allFiles.filter(
    (f) => !isConflict(f.index, f.workingDir) && (f.workingDir !== '' || f.index === '?')
  )

  const scm = useCallback(
    async (
      action: 'stage' | 'unstage' | 'stageAll' | 'unstageAll',
      path?: string
    ): Promise<void> => {
      if (!targetCwd) return
      try {
        if (action === 'stage' && path) {
          await window.nimbus.git.stage({ cwd: targetCwd, paths: [path] })
        } else if (action === 'unstage' && path) {
          await window.nimbus.git.unstage({ cwd: targetCwd, paths: [path] })
        } else if (action === 'stageAll') {
          await window.nimbus.git.stageAll({ cwd: targetCwd })
        } else if (action === 'unstageAll') {
          await window.nimbus.git.unstageAll({ cwd: targetCwd })
        }
        await refresh()
      } catch (error) {
        setMessage(`操作に失敗: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    [targetCwd, refresh]
  )

  const handleGenerateMessage = useCallback(async (): Promise<void> => {
    if (!targetCwd) return
    setGenerating(true)
    setMessage(null)
    try {
      const result = await window.nimbus.git.generateCommitMessage({ cwd: targetCwd })
      setCommitMessage(result.message)
    } catch (error) {
      setMessage(`生成に失敗: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setGenerating(false)
    }
  }, [targetCwd])

  const handleCommit = useCallback(async (): Promise<void> => {
    if (!targetCwd || !commitMessage.trim()) return
    try {
      const { hash } = await window.nimbus.git.commit({
        cwd: targetCwd,
        message: commitMessage.trim()
      })
      setCommitMessage('')
      setMessage(`コミットしました: ${hash.slice(0, 7)}`)
      await refresh()
    } catch (error) {
      setMessage(`コミットに失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [targetCwd, commitMessage, refresh])

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined
  const canSendComment =
    activeSession !== undefined && !TERMINAL_STATUSES.has(activeSession.status) && comment.trim()

  const handleSendComment = useCallback(async (): Promise<void> => {
    if (!activeSessionId || !comment.trim()) return
    const text = selectedFile
      ? `レビューコメント（${selectedFile}）: ${comment.trim()}`
      : `レビューコメント: ${comment.trim()}`
    try {
      await window.nimbus.sessions.send({ sessionId: activeSessionId, text })
      setComment('')
      setMessage('レビューコメントをセッションへ送信しました')
    } catch (error) {
      setMessage(`送信に失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [activeSessionId, comment, selectedFile])

  if (!targetCwd) {
    return (
      <div className="review review-empty">
        <p>
          レビュー対象がありません。ステータスバー横の「フォルダを開く」でワークスペースを
          選択するか、セッションを開始してください。
        </p>
      </div>
    )
  }

  return (
    <div className="review">
      <aside className="review-side">
        <div className="review-side-header">
          <span title={targetCwd}>{targetCwd.split('/').pop()}</span>
          <span className="ctx-muted">{status?.branch ?? ''}</span>
          <button className="btn btn-small" onClick={() => void refresh()}>
            更新
          </button>
        </div>
        {status && !status.isRepo && <p className="settings-muted">Git リポジトリではありません</p>}

        {conflictFiles.length > 0 && (
          <>
            <div className="review-side-header">
              <span className="review-conflict-title">⚠ 競合 ({conflictFiles.length})</span>
            </div>
            <ul className="review-files">
              {conflictFiles.map((f) => (
                <li key={`c-${f.path}`}>
                  <button
                    className={`review-file ${selectedFile === f.path ? 'review-file-active' : ''}`}
                    onClick={() => void openDiff(f.path)}
                  >
                    <span className="review-file-status review-conflict-title">競合</span>
                    <span className="review-file-path">{f.path}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="settings-muted review-conflict-note">
              競合はエディタや Claude で解決してから、変更としてステージしてください
            </p>
          </>
        )}

        <div className="review-side-header">
          <span>ステージ済み ({stagedFiles.length})</span>
          {stagedFiles.length > 0 && (
            <button className="btn btn-small" onClick={() => void scm('unstageAll')}>
              全て解除
            </button>
          )}
        </div>
        <ul className="review-files">
          {stagedFiles.map((f) => (
            <li key={`s-${f.path}`} className="review-file-row">
              <button
                className={`review-file ${selectedFile === f.path ? 'review-file-active' : ''}`}
                onClick={() => void openDiff(f.path)}
              >
                <span className="review-file-status">{fileStatusLabel(f.index, f.workingDir)}</span>
                <span className="review-file-path">{f.path}</span>
              </button>
              <button
                className="btn btn-icon"
                title="ステージ解除"
                onClick={() => void scm('unstage', f.path)}
              >
                −
              </button>
            </li>
          ))}
          {stagedFiles.length === 0 && <li className="settings-muted">なし</li>}
        </ul>

        <div className="review-side-header">
          <span>変更 ({unstagedFiles.length})</span>
          {unstagedFiles.length > 0 && (
            <button className="btn btn-small" onClick={() => void scm('stageAll')}>
              全てステージ
            </button>
          )}
        </div>
        <ul className="review-files">
          {unstagedFiles.map((f) => (
            <li key={`u-${f.path}`} className="review-file-row">
              <button
                className={`review-file ${selectedFile === f.path ? 'review-file-active' : ''}`}
                onClick={() => void openDiff(f.path)}
              >
                <span className="review-file-status">{fileStatusLabel(f.index, f.workingDir)}</span>
                <span className="review-file-path">{f.path}</span>
              </button>
              <button
                className="btn btn-icon"
                title="ステージ"
                onClick={() => void scm('stage', f.path)}
              >
                ＋
              </button>
            </li>
          ))}
          {status?.isRepo && unstagedFiles.length === 0 && (
            <li className="settings-muted">変更はありません</li>
          )}
        </ul>

        <div className="review-commit">
          <textarea
            rows={3}
            value={commitMessage}
            placeholder="コミットメッセージ"
            onChange={(e) => setCommitMessage(e.target.value)}
          />
          <div className="review-commit-actions">
            <button
              className="btn btn-small"
              disabled={generating}
              onClick={() => void handleGenerateMessage()}
              title="変更内容から Claude がコミットメッセージを生成します"
            >
              {generating ? '生成中…' : '✨ 自動生成'}
            </button>
            <button
              className="btn btn-small btn-primary"
              disabled={stagedFiles.length === 0 || !commitMessage.trim()}
              onClick={() => void handleCommit()}
            >
              コミット
            </button>
          </div>
        </div>
        <div className="review-side-header">
          <span>チェックポイント</span>
        </div>
        <div className="review-cp-create">
          <input
            value={checkpointLabel}
            placeholder="チェックポイント名"
            onChange={(e) => setCheckpointLabel(e.target.value)}
          />
          <button className="btn btn-small btn-primary" onClick={() => void handleCheckpoint()}>
            ＋作成
          </button>
        </div>
        <ul className="review-history">
          {history.map((cp) => (
            <li key={cp.hash} className="review-cp">
              <span className="review-cp-label" title={cp.hash}>
                {cp.isCheckpoint ? '📌 ' : ''}
                {cp.label.slice(0, 40)}
              </span>
              <button className="btn btn-small" onClick={() => void handleRestore(cp)}>
                復元
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="review-main">
        <div className="review-toolbar">
          <span className="review-toolbar-file">
            {selectedFile ?? 'ファイルを選択してください'}
          </span>
          {selectedFile && (
            <button className="btn btn-small" onClick={() => void handleRevert()}>
              このファイルを巻き戻す
            </button>
          )}
        </div>
        <div className="review-editor" ref={containerRef} />
        <div className="review-comment">
          <textarea
            rows={2}
            value={comment}
            placeholder={
              activeSession
                ? 'レビューコメント（そのまま次の指示としてセッションへ送信）'
                : 'コメント送信にはアクティブなセッションが必要です'
            }
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={!canSendComment}
            onClick={() => void handleSendComment()}
          >
            セッションへ送信
          </button>
        </div>
        {message && <p className="settings-muted review-message">{message}</p>}
      </div>
    </div>
  )
}

export default ReviewView
