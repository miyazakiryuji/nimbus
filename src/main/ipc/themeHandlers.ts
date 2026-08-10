import { existsSync, watch, type FSWatcher } from 'fs'
import { dirname } from 'path'
import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { buildCssVars, themeStateSchema, type ThemeState } from '@shared/theme'
import { settingsSaveFontRequestSchema, themeSetSelectedRequestSchema } from '@shared/ipc-schemas'
import type { ConfigService } from '../services/ConfigService'
import type { ThemeService } from '../services/ThemeService'

/**
 * テーマ関連 IPC（F-8）。
 * 再起動不要の即時反映: テーマ変更・~/.nimbus/themes の変更・settings.json の直接編集・
 * OS ダークモード変更のすべてで themeChanged を push する。
 */
export function registerThemeIpc(config: ConfigService, themes: ThemeService): void {
  let settingsWatcher: FSWatcher | undefined

  const buildState = (): ThemeState => {
    // ディレクトリが後から作られたケースに備え、状態要求のたびに再スキャン＋watch 再武装
    // （startWatching は冪等。ディレクトリ不在時はスキップされ、出現後に武装される）
    themes.rescan()
    themes.startWatching()
    const settings = config.loadSettings()
    const resolved = themes.resolve(settings.theme, nativeTheme.shouldUseDarkColors)
    return themeStateSchema.parse({
      themes: themes.list(),
      selected: settings.theme,
      activeThemeId: resolved.id,
      cssVars: buildCssVars(resolved.theme, settings.font),
      font: settings.font
    })
  }

  const broadcast = (): void => {
    try {
      const state = buildState()
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC_CHANNELS.themeChanged, state)
      }
    } catch (error) {
      console.error('[nimbus:theme] broadcast failed', error)
    }
  }

  // settings.json の直接編集も反映する（§5: GUI と JSON の双方向）
  const armSettingsWatch = (): void => {
    const dir = dirname(config.settingsFilePath)
    if (settingsWatcher || !existsSync(dir)) return
    try {
      settingsWatcher = watch(dir, (_event, filename) => {
        if (filename === 'settings.json') broadcast()
      })
    } catch (error) {
      console.warn('[nimbus:theme] failed to watch settings.json', error)
    }
  }

  ipcMain.handle(IPC_CHANNELS.themeState, () => buildState())

  ipcMain.handle(IPC_CHANNELS.themeSetSelected, (_event, raw: unknown) => {
    const req = themeSetSelectedRequestSchema.parse(raw)
    const settings = config.loadSettings()
    config.saveSettings({ ...settings, theme: req.selected })
    armSettingsWatch()
    broadcast()
    return buildState()
  })

  ipcMain.handle(IPC_CHANNELS.settingsSaveFont, (_event, raw: unknown) => {
    const req = settingsSaveFontRequestSchema.parse(raw)
    const settings = config.loadSettings()
    config.saveSettings({ ...settings, font: req.font })
    armSettingsWatch()
    broadcast()
    return buildState()
  })

  themes.on('changed', broadcast)
  themes.startWatching()
  nativeTheme.on('updated', broadcast)
  armSettingsWatch()
}
