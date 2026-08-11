import { app, ipcMain } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { ConfigService } from '../services/ConfigService'
import type { ConnectionService } from '../services/ConnectionService'
import type { LogBuffer } from '../services/LogBuffer'

/** 診断ビュー（不具合調査画面）の IPC。ログは LogBuffer 側でサニタイズ済み */
export function registerDiagIpc(
  logBuffer: LogBuffer,
  config: ConfigService,
  connection: ConnectionService
): void {
  ipcMain.handle(IPC_CHANNELS.diagInfo, async () => {
    const profiles = config.loadProfiles()
    const active = profiles.profiles.find((p) => p.id === profiles.activeProfileId)
    return {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: `${process.platform}/${process.arch}`,
      packaged: app.isPackaged,
      userDataPath: app.getPath('userData'),
      dbPath: join(app.getPath('userData'), 'nimbus.db'),
      settingsPath: config.settingsFilePath,
      activeProfile: active ? `${active.name} (${active.method})` : '既定（CLI ログイン）',
      binary: await connection.detectSystemBinary()
    }
  })

  ipcMain.handle(IPC_CHANNELS.diagLogs, () => logBuffer.list())

  ipcMain.handle(IPC_CHANNELS.diagClear, () => {
    logBuffer.clear()
    return { ok: true }
  })
}
