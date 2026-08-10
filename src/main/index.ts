import { app, BrowserWindow } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { SessionManager } from './services/SessionManager'
import { registerSessionIpc } from './ipc/sessionHandlers'

const sessionManager = new SessionManager()

if (is.dev) {
  // 開発時の観測用。イベント本文は出さない（サニタイザ導入は Step 3）
  sessionManager.on('event', (event: { kind: string; sessionId: string }) => {
    console.log(`[nimbus:main] event kind=${event.kind} session=${event.sessionId.slice(0, 8)}`)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.idris.nimbus')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerSessionIpc(sessionManager)
  createMainWindow()

  // E2E 起動確認用スモーク: NIMBUS_SMOKE=1 で 1 往復を自動実行する（docs/testing 参照）
  if (process.env['NIMBUS_SMOKE'] === '1') {
    setTimeout(() => {
      sessionManager.createSession({
        cwd: process.cwd(),
        firstMessage: 'Reply with exactly: NIMBUS_OK'
      })
    }, 3000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
