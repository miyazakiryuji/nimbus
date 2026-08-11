import { useUiStore } from '../stores/uiStore'

const ITEMS: Array<{
  view: 'cockpit' | 'explorer' | 'board' | 'review' | 'diagnostics' | 'settings'
  icon: string
  label: string
}> = [
  { view: 'cockpit', icon: '💬', label: 'コックピット' },
  { view: 'explorer', icon: '📁', label: 'エディタ' },
  { view: 'board', icon: '🗂', label: 'ボード' },
  { view: 'review', icon: '🔀', label: 'レビュー' },
  { view: 'diagnostics', icon: '🩺', label: '診断' },
  { view: 'settings', icon: '⚙', label: '設定' }
]

/** VS Code のアクティビティバー相当（左端の縦アイコン列） */
function ActivityBar(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)

  return (
    <nav className="activitybar">
      {ITEMS.map((item) => (
        <button
          key={item.view}
          className={`activitybar-item ${view === item.view ? 'activitybar-item-active' : ''}`}
          title={item.label}
          aria-label={item.label}
          onClick={() => setView(item.view)}
        >
          <span className="activitybar-icon">{item.icon}</span>
        </button>
      ))}
    </nav>
  )
}

export default ActivityBar
