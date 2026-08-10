import ChatView from './features/cockpit/ChatView'
import SessionsPanel from './features/cockpit/SessionsPanel'

function App(): React.JSX.Element {
  return (
    <div className="cockpit">
      <SessionsPanel />
      <ChatView />
    </div>
  )
}

export default App
