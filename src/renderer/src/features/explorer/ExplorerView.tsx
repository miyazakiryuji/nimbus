import { useCallback, useEffect, useRef, useState } from 'react'
import {
  directoryListingSchema,
  fileContentSchema,
  filesChangedSchema,
  type FileEntry
} from '@shared/files'
import { languageForPath, monaco } from '../review/monacoSetup'
import { monacoThemeFor } from '../review/monacoTheme'
import { useSessionStore } from '../../stores/sessionStore'
import { useUiStore } from '../../stores/uiStore'

function formatSize(size?: number): string {
  if (size === undefined) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/**
 * エクスプローラー本体。root はマウント中不変（切替は key による再マウントで扱う）。
 */
function ExplorerBody({ root }: { root: string }): React.JSX.Element {
  const themeState = useUiStore((s) => s.themeState)
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  // 外部変更ハンドラから最新値を読むための ref（毎回購読し直さないため）
  const openPathRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)

  useEffect(() => {
    openPathRef.current = openPath
    dirtyRef.current = dirty
  })

  const loadDir = useCallback(
    async (dir: string): Promise<void> => {
      try {
        const raw = await window.nimbus.files.list({ root, path: dir })
        const parsed = directoryListingSchema.safeParse(raw)
        if (!parsed.success) return
        setChildren((prev) => ({ ...prev, [dir]: parsed.data.entries }))
        if (parsed.data.truncated) {
          setNotice(`${dir || '/'} は表示件数の上限で打ち切りました`)
        }
      } catch (error) {
        setNotice(`読み込みに失敗: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    [root]
  )

  // 初回にルート直下を読み込む（外部システムからの取得。setState は await 後のコールバックのみ）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDir('')
  }, [loadDir])

  // Monaco エディタの生成・破棄（テーマ変更時は作り直す）
  useEffect(() => {
    if (!containerRef.current) return
    const editor = monaco.editor.create(containerRef.current, {
      value: '',
      language: 'plaintext',
      theme: monacoThemeFor(themeState),
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 12,
      readOnly: true
    })
    editorRef.current = editor
    const sub = editor.onDidChangeModelContent(() => {
      if (!editor.getOption(monaco.editor.EditorOption.readOnly)) setDirty(true)
    })
    return () => {
      sub.dispose()
      editor.getModel()?.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [themeState])

  const openFile = useCallback(
    async (path: string, options?: { keepViewState?: boolean }): Promise<void> => {
      const editor = editorRef.current
      if (!editor) return
      try {
        const raw = await window.nimbus.files.read({ root, path })
        const parsed = fileContentSchema.safeParse(raw)
        if (!parsed.success) return
        const file = parsed.data
        const viewState = options?.keepViewState ? editor.saveViewState() : null

        const readOnly = file.binary || file.tooLarge
        const body = file.binary
          ? '// バイナリファイルのため表示できません'
          : file.tooLarge
            ? `// ファイルが大きすぎるため表示できません（${formatSize(file.size)}）`
            : file.content
        const old = editor.getModel()
        editor.setModel(monaco.editor.createModel(body, languageForPath(path)))
        old?.dispose()
        editor.updateOptions({ readOnly })
        if (viewState) editor.restoreViewState(viewState)
        setOpenPath(path)
        setDirty(false)
        setNotice(readOnly ? '読み取り専用で開きました' : null)
      } catch (error) {
        setNotice(`開けませんでした: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    [root]
  )

  const save = useCallback(async (): Promise<void> => {
    const editor = editorRef.current
    const path = openPathRef.current
    if (!editor || !path) return
    if (editor.getOption(monaco.editor.EditorOption.readOnly)) return
    try {
      await window.nimbus.files.write({ root, path, content: editor.getValue() })
      setDirty(false)
      setNotice(`保存しました: ${path}`)
    } catch (error) {
      setNotice(`保存に失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [root])

  // 起動時に開くファイルの指定（開発・撮影用。通常は null）
  const initialFile = useUiStore((s) => s.initialFile)
  useEffect(() => {
    if (!initialFile) return
    const timer = setTimeout(() => void openFile(initialFile), 400)
    return () => clearTimeout(timer)
  }, [initialFile, openFile])

  // Cmd/Ctrl+S で保存
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save])

  // Claude などによる外部変更の反映（編集中でないファイルのみ自動リロード）
  useEffect(() => {
    return window.nimbus.files.onChanged((raw) => {
      const parsed = filesChangedSchema.safeParse(raw)
      if (!parsed.success || parsed.data.root !== root) return
      if (import.meta.env.DEV) {
        console.log(`[nimbus:renderer] files changed n=${parsed.data.paths.length}`)
      }
      setChildren((prev) => {
        for (const dir of Object.keys(prev)) void loadDir(dir)
        return prev
      })
      const path = openPathRef.current
      if (path && !dirtyRef.current && parsed.data.paths.includes(path)) {
        void openFile(path, { keepViewState: true })
      }
    })
  }, [root, loadDir, openFile])

  const toggleDir = useCallback(
    (path: string): void => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
          void loadDir(path)
        }
        return next
      })
    },
    [loadDir]
  )

  const renderTree = (dir: string, depth: number): React.JSX.Element[] => {
    const entries = children[dir] ?? []
    return entries.flatMap((entry) => {
      const rows: React.JSX.Element[] = [
        <li key={entry.path}>
          <button
            className={`tree-row ${openPath === entry.path ? 'tree-row-active' : ''}`}
            style={{ paddingLeft: `${0.4 + depth * 0.8}rem` }}
            onClick={() => (entry.isDirectory ? toggleDir(entry.path) : void openFile(entry.path))}
          >
            <span className="tree-icon">
              {entry.isDirectory ? (expanded.has(entry.path) ? '▾' : '▸') : '·'}
            </span>
            <span className="tree-name">{entry.name}</span>
            {!entry.isDirectory && <span className="tree-size">{formatSize(entry.size)}</span>}
          </button>
        </li>
      ]
      if (entry.isDirectory && expanded.has(entry.path)) {
        rows.push(
          <li key={`${entry.path}-children`}>
            <ul className="tree-list">{renderTree(entry.path, depth + 1)}</ul>
          </li>
        )
      }
      return rows
    })
  }

  return (
    <div className="explorer">
      <aside className="explorer-tree">
        <div className="explorer-header">
          <span title={root}>{root.split('/').pop()}</span>
          <button className="btn btn-small" onClick={() => void loadDir('')}>
            更新
          </button>
        </div>
        <ul className="tree-list">{renderTree('', 0)}</ul>
      </aside>
      <div className="explorer-main">
        <div className="explorer-toolbar">
          <span className="explorer-path">
            {openPath ?? 'ファイルを選択してください'}
            {dirty && <span className="explorer-dirty"> ●</span>}
          </span>
          <button
            className="btn btn-small btn-primary"
            disabled={!dirty}
            onClick={() => void save()}
          >
            保存 (⌘S)
          </button>
        </div>
        <div className="explorer-editor" ref={containerRef} />
        {notice && <p className="settings-muted explorer-notice">{notice}</p>}
      </div>
    </div>
  )
}

/**
 * IDE のエクスプローラー＋エディタ。
 * 遅延ロードのファイルツリーと Monaco エディタ（Cmd/Ctrl+S 保存）。
 * Claude がファイルを書き換えたら、編集中でないファイルは自動で再読み込みする。
 */
function ExplorerView(): React.JSX.Element {
  const workspace = useUiStore((s) => s.workspace)
  const { sessions, activeSessionId } = useSessionStore()

  // 対象ルート: アクティブセッションの cwd（タスクの worktree）優先、なければワークスペース
  const activeInit = activeSessionId
    ? sessions[activeSessionId]?.events.find((e) => e.kind === 'session-init')
    : undefined
  const sessionCwd = activeInit && 'cwd' in activeInit ? activeInit.cwd : null
  const root = sessionCwd ?? workspace

  if (!root) {
    return (
      <div className="explorer explorer-empty">
        <p>
          ステータスバーの「フォルダを開く」でワークスペースを選択するか、セッションを開始すると
          ファイルツリーが表示されます。
        </p>
      </div>
    )
  }
  // ルートが変わったら状態を作り直す（key による再マウント）
  return <ExplorerBody key={root} root={root} />
}

export default ExplorerView
