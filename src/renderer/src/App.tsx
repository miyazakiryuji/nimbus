import ChatView from './features/cockpit/ChatView'
import SessionsPanel from './features/cockpit/SessionsPanel'
import ContextPanel from './features/context/ContextPanel'
import InboxBanner from './features/inbox/InboxBanner'
import SettingsView from './features/settings/SettingsView'
import StatusBar from './components/StatusBar'
import { useThemeSync } from './theme/useThemeSync'
import { useUiStore } from './stores/uiStore'

function App(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  useThemeSync()
  return (
    <div className="app">
      {view === 'cockpit' && <InboxBanner />}
      <div className="app-main">
        {view === 'cockpit' ? (
          <div className="cockpit">
            <SessionsPanel />
            <ChatView />
            <ContextPanel />
          </div>
        ) : (
          <SettingsView />
        )}
      </div>
      <StatusBar />
    </div>
  )
}

export default App
