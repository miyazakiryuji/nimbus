import ChatView from './features/cockpit/ChatView'
import SessionsPanel from './features/cockpit/SessionsPanel'
import ContextPanel from './features/context/ContextPanel'
import InboxBanner from './features/inbox/InboxBanner'
import ReviewView from './features/review/ReviewView'
import SettingsView from './features/settings/SettingsView'
import StatusBar from './components/StatusBar'
import { useThemeSync } from './theme/useThemeSync'
import { useUiStore } from './stores/uiStore'

function App(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  useThemeSync()
  return (
    <div className="app">
      {view !== 'settings' && <InboxBanner />}
      <div className="app-main">
        {view === 'cockpit' && (
          <div className="cockpit">
            <SessionsPanel />
            <ChatView />
            <ContextPanel />
          </div>
        )}
        {view === 'review' && <ReviewView />}
        {view === 'settings' && <SettingsView />}
      </div>
      <StatusBar />
    </div>
  )
}

export default App
