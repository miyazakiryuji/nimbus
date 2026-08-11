import { useCallback, useEffect, useState } from 'react'
import {
  connectionStateSchema,
  connectionTestResultSchema,
  type ConnectionMethod,
  type ConnectionTestResult,
  type Profile
} from '@shared/profiles'
import { useUiStore } from '../../stores/uiStore'

const METHOD_LABELS: Record<ConnectionMethod, string> = {
  'claude-cli': 'Claude Code ログイン（既定・CLI のログイン状態を利用）',
  'api-key': 'API キー（Claude Console 発行・従量課金）',
  bedrock: 'Amazon Bedrock',
  vertex: 'Google Cloud（Vertex）',
  foundry: 'Microsoft Foundry'
}

const emptyProfile = (): Profile => ({
  id: crypto.randomUUID(),
  name: '',
  method: 'claude-cli',
  env: {},
  binary: 'bundled'
})

function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

function textToEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

function ThemeSection(): React.JSX.Element {
  const themeState = useUiStore((s) => s.themeState)
  const [fontFamily, setFontFamily] = useState('')
  const [fontSize, setFontSize] = useState('')
  const [lineHeight, setLineHeight] = useState('')
  const [fontMessage, setFontMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!themeState) return
    // テーマ状態が届いたら現在値をフォームへ反映（JSON 直接編集との双方向反映）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFontFamily(themeState.font.fontFamily ?? '')
    setFontSize(themeState.font.fontSize?.toString() ?? '')
    setLineHeight(themeState.font.lineHeight?.toString() ?? '')
  }, [themeState])

  const handleThemeChange = async (selected: string): Promise<void> => {
    await window.nimbus.theme.setSelected({ selected })
  }

  const handleFontSave = async (): Promise<void> => {
    setFontMessage(null)
    try {
      const font: { fontFamily?: string; fontSize?: number; lineHeight?: number } = {}
      if (fontFamily.trim()) font.fontFamily = fontFamily.trim()
      if (fontSize.trim()) font.fontSize = Number(fontSize)
      if (lineHeight.trim()) font.lineHeight = Number(lineHeight)
      await window.nimbus.theme.saveFont({ font })
      setFontMessage('保存しました（即時反映）')
    } catch (error) {
      setFontMessage(`保存に失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <section className="settings-section">
      <h3>テーマ</h3>
      <label className="settings-field">
        <span>テーマ（~/.nimbus/themes/*.json を置くと自動で追加されます）</span>
        <select
          value={themeState?.selected ?? 'system'}
          onChange={(e) => void handleThemeChange(e.target.value)}
        >
          <option value="system">OS に追従（ダークモード連動）</option>
          {(themeState?.themes ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.source === 'user' ? '（ユーザー）' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        <span>フォントファミリ</span>
        <input
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          placeholder="空欄で既定"
        />
      </label>
      <div className="settings-row">
        <label className="settings-field">
          <span>フォントサイズ (px)</span>
          <input
            type="number"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
            placeholder="14"
          />
        </label>
        <label className="settings-field">
          <span>行間</span>
          <input
            type="number"
            step="0.1"
            value={lineHeight}
            onChange={(e) => setLineHeight(e.target.value)}
            placeholder="1.6"
          />
        </label>
      </div>
      <div className="settings-actions">
        <button className="btn btn-primary" onClick={() => void handleFontSave()}>
          フォント設定を保存
        </button>
      </div>
      {fontMessage && <p className="settings-muted">{fontMessage}</p>}
    </section>
  )
}

function SettingsView(): React.JSX.Element {
  const { connection, setConnection } = useUiStore()
  const [editing, setEditing] = useState<Profile>(emptyProfile())
  const [envText, setEnvText] = useState('')
  const [secret, setSecret] = useState('')
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const raw = await window.nimbus.connection.getState()
      const parsed = connectionStateSchema.safeParse(raw)
      if (parsed.success) setConnection(parsed.data)
    } catch (error) {
      console.error('[nimbus:renderer] connection state failed', error)
    }
  }, [setConnection])

  useEffect(() => {
    // 外部システム（main プロセス）からの取得。setState は await 後のコールバックのみ
    void refresh()
  }, [refresh])

  const selectProfile = (profile: Profile): void => {
    setEditing(profile)
    setEnvText(envToText(profile.env))
    setSecret('')
    setMessage(null)
  }

  const handleSave = async (): Promise<void> => {
    setMessage(null)
    try {
      const profile: Profile = { ...editing, env: textToEnv(envText) }
      if (!profile.name.trim()) {
        setMessage('プロファイル名を入力してください')
        return
      }
      const raw = await window.nimbus.connection.saveProfile({
        profile,
        secret: secret.trim() ? secret.trim() : undefined
      })
      const parsed = connectionStateSchema.safeParse(raw)
      if (parsed.success) setConnection(parsed.data)
      setSecret('')
      setMessage('保存しました')
    } catch (error) {
      setMessage(`保存に失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleDelete = async (profileId: string): Promise<void> => {
    const raw = await window.nimbus.connection.deleteProfile({ profileId })
    const parsed = connectionStateSchema.safeParse(raw)
    if (parsed.success) setConnection(parsed.data)
  }

  const handleSetActive = async (profileId: string | null): Promise<void> => {
    const raw = await window.nimbus.connection.setActive({ profileId })
    const parsed = connectionStateSchema.safeParse(raw)
    if (parsed.success) setConnection(parsed.data)
  }

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const raw = await window.nimbus.connection.test()
      const parsed = connectionTestResultSchema.safeParse(raw)
      if (parsed.success) setTestResult(parsed.data)
    } catch (error) {
      setTestResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setTesting(false)
    }
  }

  const needsSecret = editing.method === 'api-key' || editing.method === 'foundry'

  return (
    <div className="settings">
      <h2 className="settings-title">設定</h2>
      <ThemeSection />

      {connection && !connection.canPersistSecrets && (
        <p className="settings-warning">
          ⚠ この環境では OS のセキュアストレージが利用できないため、API
          キーの保存はできません（平文保存は行いません。§6-1）
        </p>
      )}

      <section className="settings-section">
        <h3>プロファイル</h3>
        <ul className="profiles-list">
          {(connection?.profiles ?? []).map((p) => (
            <li key={p.id} className="profile-row">
              <button className="profile-name" onClick={() => selectProfile(p)}>
                {p.name} <span className="profile-method">({METHOD_LABELS[p.method]})</span>
                {p.id === connection?.activeProfileId && (
                  <span className="profile-active"> ● 使用中</span>
                )}
                {connection?.hasStoredSecret[p.id] && (
                  <span className="profile-secret"> 🔑保存済み</span>
                )}
              </button>
              <span>
                <button className="btn btn-small" onClick={() => void handleSetActive(p.id)}>
                  使用
                </button>
                <button className="btn btn-small" onClick={() => void handleDelete(p.id)}>
                  削除
                </button>
              </span>
            </li>
          ))}
          {(connection?.profiles.length ?? 0) === 0 && (
            <li className="settings-muted">
              プロファイル未登録（既定: CLI のログイン状態をそのまま利用します）
            </li>
          )}
        </ul>
        <button className="btn btn-small" onClick={() => selectProfile(emptyProfile())}>
          ＋ 新規プロファイル
        </button>
        {connection?.activeProfileId && (
          <button className="btn btn-small" onClick={() => void handleSetActive(null)}>
            既定（CLI ログイン）に戻す
          </button>
        )}
      </section>

      <section className="settings-section">
        <h3>編集</h3>
        <label className="settings-field">
          <span>名前</span>
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="仕事用 / 個人用 など"
          />
        </label>
        <label className="settings-field">
          <span>接続方式</span>
          <select
            value={editing.method}
            onChange={(e) => setEditing({ ...editing, method: e.target.value as ConnectionMethod })}
          >
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {editing.method === 'claude-cli' && (
          <p className="settings-muted">
            未ログインの場合はターミナルで <code>claude</code> を実行し、画面の指示に従って
            ログインしてください（Nimbus はログイン画面を提供しません）。
            この方式はあなた自身のログイン状態に乗る個人利用向けです。組織での配布・ 本番用途では
            API キーまたはクラウドプロバイダ方式を推奨します
          </p>
        )}
        {needsSecret && (
          <label className="settings-field">
            <span>{editing.method === 'api-key' ? 'API キー' : 'Foundry API キー'}</span>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={
                connection?.hasStoredSecret[editing.id]
                  ? '保存済み（変更する場合のみ入力）'
                  : 'safeStorage で暗号化保存されます'
              }
              disabled={connection ? !connection.canPersistSecrets : false}
            />
          </label>
        )}
        <label className="settings-field">
          <span>環境変数（非機密のみ・1 行 1 つ KEY=VALUE）</span>
          <textarea
            rows={3}
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            placeholder={'CLOUD_ML_REGION=global\nANTHROPIC_VERTEX_PROJECT_ID=my-project'}
          />
        </label>
        <label className="settings-field">
          <span>Claude Code バイナリ</span>
          <select
            value={editing.binary}
            onChange={(e) =>
              setEditing({ ...editing, binary: e.target.value as 'bundled' | 'system' })
            }
          >
            <option value="bundled">SDK 同梱バイナリ（既定）</option>
            <option value="system">
              システムの claude
              {connection?.binaryInfo.systemVersion
                ? `（${connection.binaryInfo.systemVersion}）`
                : connection?.binaryInfo.systemPath
                  ? `（${connection.binaryInfo.systemPath}）`
                  : '（未検出）'}
            </option>
          </select>
        </label>
        <div className="settings-actions">
          <button className="btn btn-primary" onClick={() => void handleSave()}>
            保存
          </button>
          <button className="btn" onClick={() => void handleTest()} disabled={testing}>
            {testing ? 'テスト中…' : '接続テスト'}
          </button>
        </div>
        {message && <p className="settings-muted">{message}</p>}
        {testResult && (
          <div className={`test-result ${testResult.ok ? '' : 'test-result-error'}`}>
            {testResult.ok ? (
              <>
                ✓ 接続成功 — モデル: {testResult.model} / Claude Code {testResult.claudeCodeVersion}{' '}
                / 認証: {testResult.apiKeySource}
                {(testResult.mcpServers?.length ?? 0) > 0 &&
                  ` / MCP: ${testResult.mcpServers?.join(', ')}`}
                {(testResult.plugins?.length ?? 0) > 0 &&
                  ` / プラグイン: ${testResult.plugins?.join(', ')}`}
              </>
            ) : (
              <>✗ 接続失敗: {testResult.error}</>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default SettingsView
