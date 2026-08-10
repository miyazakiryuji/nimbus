import { billingModeLabel } from '@shared/profiles'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'

/**
 * F-7-3: 課金モードの常時表示。
 * ユーザーが自分の請求形態を誤認しないことは、このプロダクトの信頼性そのものである。
 */
function StatusBar(): React.JSX.Element {
  const sessions = useSessionStore((s) => s.sessions)
  const { view, setView, connection, lastApiKeySource } = useUiStore()

  // セッション横断の累計（各セッションの totalCostUsd は累積値なのでセッション毎に最新値を合算）
  const totalCost = Object.values(sessions).reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0)
  const activeProfile = connection?.profiles.find((p) => p.id === connection.activeProfileId)

  return (
    <footer className="status-bar">
      <span className="status-bar-billing">
        {billingModeLabel(lastApiKeySource ?? undefined)}
        {lastApiKeySource !== null &&
          lastApiKeySource !== 'oauth' &&
          ` · 累計 $${totalCost.toFixed(2)}`}
        {lastApiKeySource === 'oauth' && totalCost > 0 && ` · 推定 $${totalCost.toFixed(2)} 相当`}
      </span>
      <span className="status-bar-right">
        <span className="status-bar-profile">
          {activeProfile
            ? `プロファイル: ${activeProfile.name}`
            : 'プロファイル: 既定（CLI ログイン）'}
        </span>
        <button
          className="btn btn-small"
          onClick={() => setView(view === 'settings' ? 'cockpit' : 'settings')}
        >
          {view === 'settings' ? 'コックピットへ' : '設定'}
        </button>
      </span>
    </footer>
  )
}

export default StatusBar
