import ChatView from './features/cockpit/ChatView'
import SessionsPanel from './features/cockpit/SessionsPanel'
import SettingsView from './features/settings/SettingsView'
import StatusBar from './components/StatusBar'
import { useUiStore } from './stores/uiStore'

function App(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  return (
    <div className="app">
      <div className="app-main">
        {view === 'cockpit' ? (
          <div className="cockpit">
            <SessionsPanel />
            <ChatView />
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
