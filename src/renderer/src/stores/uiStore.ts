import { create } from 'zustand'
import type { ConnectionState } from '@shared/profiles'
import type { ThemeState } from '@shared/theme'

interface UiStoreState {
  view: 'cockpit' | 'settings'
  setView: (view: 'cockpit' | 'settings') => void
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
  connection: null,
  setConnection: (connection) => set({ connection }),
  lastApiKeySource: null,
  setLastApiKeySource: (lastApiKeySource) => set({ lastApiKeySource }),
  themeState: null,
  setThemeState: (themeState) => set({ themeState })
}))
