import { billingModeLabel } from '@shared/profiles'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'
import { useActiveRoot } from '../hooks/useActiveRoot'

const VIEW_LABELS: Record<string, string> = {
  cockpit: 'コックピット',
  explorer: 'エディタ',
  board: 'ボード',
  review: 'レビュー',
  diagnostics: '診断',
  settings: '設定'
}

/**
 * F-7-3: 課金モードの常時表示。
 * ユーザーが自分の請求形態を誤認しないことは、このプロダクトの信頼性そのものである。
 * （ビュー切替とフォルダを開くは上部メニュー／アクティビティバーへ移設）
 */
function StatusBar(): React.JSX.Element {
  const sessions = useSessionStore((s) => s.sessions)
  const { view, connection, lastApiKeySource } = useUiStore()
  const root = useActiveRoot()

  // セッション横断の累計（各セッションの totalCostUsd は累積値なのでセッション毎に最新値を合算）
  const totalCost = Object.values(sessions).reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0)
  const activeProfile = connection?.profiles.find((p) => p.id === connection.activeProfileId)
  const label = billingModeLabel(lastApiKeySource ?? undefined, activeProfile?.method)
  const isSubscription = lastApiKeySource === 'oauth' || lastApiKeySource === 'none'
  const running = Object.values(sessions).filter((s) => s.status === 'running').length

  return (
    <footer className="status-bar">
      <span className="status-bar-billing">
        {label}
        {lastApiKeySource !== null && !isSubscription && ` · 累計 $${totalCost.toFixed(2)}`}
        {isSubscription && totalCost > 0 && ` · 推定 $${totalCost.toFixed(2)} 相当`}
      </span>
      <span className="status-bar-right">
        {running > 0 && <span className="status-bar-running">● 実行中 {running}</span>}
        <span>{VIEW_LABELS[view] ?? view}</span>
        <span className="status-bar-profile" title={root ?? undefined}>
          {root ? `📁 ${root.split('/').pop()}` : 'フォルダ未選択'}
        </span>
        <span className="status-bar-profile">
          {activeProfile ? activeProfile.name : '既定（CLI ログイン）'}
        </span>
      </span>
    </footer>
  )
}

export default StatusBar
