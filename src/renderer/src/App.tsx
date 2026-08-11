import { useEffect } from 'react'
import { z } from 'zod'
import ChatView from './features/cockpit/ChatView'
import SessionsPanel from './features/cockpit/SessionsPanel'
import ContextPanel from './features/context/ContextPanel'
import InboxBanner from './features/inbox/InboxBanner'
import BoardView from './features/board/BoardView'
import DiagnosticsView from './features/diagnostics/DiagnosticsView'
import ExplorerView from './features/explorer/ExplorerView'
import ReviewView from './features/review/ReviewView'
import SettingsView from './features/settings/SettingsView'
import StatusBar from './components/StatusBar'
import { useThemeSync } from './theme/useThemeSync'
import { useSessionSync } from './hooks/useSessionSync'
import { useUiStore } from './stores/uiStore'

const VIEWS = ['cockpit', 'explorer', 'board', 'review', 'diagnostics', 'settings'] as const

const initialSchema = z.object({
  view: z.string().nullable(),
  file: z.string().nullable()
})

function App(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  useThemeSync()
  // 全ビュー共通でセッションを購読する（コックピット以外でも状態が届くように）
  useSessionSync()

  useEffect(() => {
    // 開発・撮影用の初期表示指定（通常起動では null）
    void window.nimbus.ui
      .initial()
      .then((raw) => {
        const parsed = initialSchema.safeParse(raw)
        if (!parsed.success) return
        const { view: initialView, file } = parsed.data
        if (initialView && (VIEWS as readonly string[]).includes(initialView)) {
          setView(initialView as (typeof VIEWS)[number])
        }
        if (file) useUiStore.getState().setInitialFile(file)
      })
      .catch(() => undefined)
  }, [setView])

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
        {view === 'explorer' && <ExplorerView />}
        {view === 'board' && <BoardView />}
        {view === 'review' && <ReviewView />}
        {view === 'diagnostics' && <DiagnosticsView />}
        {view === 'settings' && <SettingsView />}
      </div>
      <StatusBar />
    </div>
  )
}

export default App
