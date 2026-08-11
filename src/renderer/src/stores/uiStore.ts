import { create } from 'zustand'
import type { ConnectionState } from '@shared/profiles'
import type { ThemeState } from '@shared/theme'

interface UiStoreState {
  view: 'cockpit' | 'board' | 'review' | 'diagnostics' | 'settings'
  setView: (view: 'cockpit' | 'board' | 'review' | 'diagnostics' | 'settings') => void
  /** 開いているワークスペース（新規セッションの cwd・レビュー対象） */
  workspace: string | null
  setWorkspace: (path: string | null) => void
  connection: ConnectionState | null
  setConnection: (state: ConnectionState) => void
  /** 直近の session-init の apiKeySource（課金モード表示に使用） */
  lastApiKeySource: string | null
  setLastApiKeySource: (source: string) => void
  themeState: ThemeState | null
  setThemeState: (state: ThemeState) => void
}

export const useUiStore = create<UiStoreState>((set) => ({
  view: 'cockpit',
  setView: (view) => set({ view }),
  workspace: null,
  setWorkspace: (workspace) => set({ workspace }),
  connection: null,
  setConnection: (connection) => set({ connection }),
  lastApiKeySource: null,
  setLastApiKeySource: (lastApiKeySource) => set({ lastApiKeySource }),
  themeState: null,
  setThemeState: (themeState) => set({ themeState })
}))
