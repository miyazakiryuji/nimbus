import { useCallback, useEffect, useRef, useState } from 'react'
import {
  directoryListingSchema,
  fileContentSchema,
  filesChangedSchema,
  type FileEntry
} from '@shared/files'
import {
  configureLanguageServices,
  EDITOR_DEFAULTS,
  languageForPath,
  modelUriFor,
  monaco
} from '../review/monacoSetup'
import { monacoThemeFor } from '../review/monacoTheme'
import { useUiStore } from '../../stores/uiStore'
import { useActiveRoot } from '../../hooks/useActiveRoot'

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
    // TypeScript/JavaScript のコード補完を有効化（冪等）
    configureLanguageServices()
    const editor = monaco.editor.create(containerRef.current, {
      ...EDITOR_DEFAULTS,
      value: '',
      language: 'plaintext',
      theme: monacoThemeFor(themeState),
      readOnly: true
    })
    editorRef.current = editor
    const sub = editor.onDidChangeModelContent(() => {
      if (!editor.getOption(monaco.editor.EditorOption.readOnly)) setDirty(true)
    })
    return () => {
      sub.dispose()
      // モデルは URI 単位で共有・再利用するため、ここでは破棄しない
      // （ルート切替時の再マウントでまとめて片付ける）
      editor.dispose()
      editorRef.current = null
    }
  }, [themeState])

  // このルートのモデルを片付ける（ルート切替＝アンマウント時）
  useEffect(() => {
    return () => {
      const prefix = `file://${root.replace(/\/+$/, '')}/`
      for (const model of monaco.editor.getModels()) {
        if (model.uri.toString().startsWith(prefix)) model.dispose()
      }
    }
  }, [root])

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
        // file:// URI のモデルにすることで、同じワークスペース内の import 解決・
        // 型情報に基づくコード補完が効く（既に開いたファイルのモデルは再利用）
        const uri = modelUriFor(root, path)
        const model =
          monaco.editor.getModel(uri) ?? monaco.editor.createModel(body, languageForPath(path), uri)
        if (model.getValue() !== body) model.setValue(body)
        editor.setModel(model)
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

  // メニュー（⌘S / ファイル→保存）からの保存要求。
  // 保存自体は非同期（IPC）なので、要求 ID の変化を検知して発火する
  const saveRequestId = useUiStore((s) => s.saveRequestId)
  const lastSaveRequestRef = useRef(saveRequestId)
  useEffect(() => {
    if (saveRequestId === lastSaveRequestRef.current) return
    lastSaveRequestRef.current = saveRequestId
    void save()
  }, [saveRequestId, save])

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
  const root = useActiveRoot()

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
