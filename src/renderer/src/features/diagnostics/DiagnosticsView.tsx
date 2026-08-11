import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

const infoSchema = z.object({
  appVersion: z.string(),
  electron: z.string(),
  node: z.string(),
  chrome: z.string(),
  platform: z.string(),
  packaged: z.boolean(),
  userDataPath: z.string(),
  dbPath: z.string(),
  settingsPath: z.string(),
  activeProfile: z.string(),
  binary: z.object({
    systemPath: z.string().optional(),
    systemVersion: z.string().optional(),
    bundledAvailable: z.boolean()
  })
})
type DiagInfo = z.infer<typeof infoSchema>

const logsSchema = z.array(
  z.object({
    timestamp: z.number(),
    level: z.enum(['log', 'warn', 'error']),
    message: z.string()
  })
)
type LogEntry = z.infer<typeof logsSchema>[number]

/**
 * 不具合調査用の診断ビュー。
 * ログはメイン側でサニタイズ済み — そのまま issue に貼れる（§6-2/6-3）。
 */
function DiagnosticsView(): React.JSX.Element {
  const [info, setInfo] = useState<DiagInfo | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [rawInfo, rawLogs] = await Promise.all([
        window.nimbus.diag.info(),
        window.nimbus.diag.logs()
      ])
      const parsedInfo = infoSchema.safeParse(rawInfo)
      if (parsedInfo.success) setInfo(parsedInfo.data)
      const parsedLogs = logsSchema.safeParse(rawLogs)
      if (parsedLogs.success) setLogs(parsedLogs.data)
    } catch (error) {
      console.error('[nimbus:renderer] diag failed', error)
    }
  }, [])

  useEffect(() => {
    // 外部システム（main プロセス）からの取得。setState は await 後のコールバックのみ
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const handleCopy = async (): Promise<void> => {
    const header = info
      ? `Nimbus ${info.appVersion} (${info.packaged ? 'packaged' : 'dev'}) / Electron ${info.electron} / ${info.platform}\n`
      : ''
    const body = logs
      .map((l) => `${new Date(l.timestamp).toISOString()} [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n')
    await navigator.clipboard.writeText(header + body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="settings diag">
      <h2 className="settings-title">診断（不具合調査）</h2>

      <section className="settings-section">
        <h3>環境情報</h3>
        {info ? (
          <dl className="ctx-kv diag-kv">
            <dt>Nimbus</dt>
            <dd>
              {info.appVersion}（{info.packaged ? 'パッケージ版' : '開発モード'}）
            </dd>
            <dt>Electron / Node / Chrome</dt>
            <dd>
              {info.electron} / {info.node} / {info.chrome}
            </dd>
            <dt>プラットフォーム</dt>
            <dd>{info.platform}</dd>
            <dt>接続プロファイル</dt>
            <dd>{info.activeProfile}</dd>
            <dt>システム claude</dt>
            <dd>{info.binary.systemVersion ?? info.binary.systemPath ?? '未検出'}</dd>
            <dt>userData</dt>
            <dd className="ctx-path">{info.userDataPath}</dd>
            <dt>DB</dt>
            <dd className="ctx-path">{info.dbPath}</dd>
            <dt>settings.json</dt>
            <dd className="ctx-path">{info.settingsPath}</dd>
          </dl>
        ) : (
          <p className="settings-muted">読み込み中…</p>
        )}
      </section>

      <section className="settings-section">
        <h3>ログ（{logs.length} 件・シークレットはマスク済み — issue にそのまま貼れます）</h3>
        <div className="settings-actions">
          <button className="btn btn-small" onClick={() => void refresh()}>
            更新
          </button>
          <button className="btn btn-small" onClick={() => void handleCopy()}>
            {copied ? 'コピーしました' : '全てコピー'}
          </button>
          <button
            className="btn btn-small"
            onClick={() =>
              void window.nimbus.diag.clear().then(() => {
                void refresh()
              })
            }
          >
            クリア
          </button>
        </div>
        <div className="diag-logs">
          {logs.map((l, i) => (
            <div key={i} className={`diag-log diag-log-${l.level}`}>
              <span className="diag-log-time">
                {new Date(l.timestamp).toLocaleTimeString('ja-JP')}
              </span>
              <span className="diag-log-message">{l.message}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="settings-muted">ログはまだありません</p>}
        </div>
      </section>
    </div>
  )
}

export default DiagnosticsView
