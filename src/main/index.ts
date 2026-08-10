import { join } from 'path'
import { app, BrowserWindow, safeStorage } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { SessionManager } from './services/SessionManager'
import { createSanitizer } from './services/sanitizer'
import { ConfigService } from './services/ConfigService'
import { CredentialVault } from './services/CredentialVault'
import { ConnectionService } from './services/ConnectionService'
import { Store } from './db/Store'
import { registerSessionIpc } from './ipc/sessionHandlers'
import { registerConnectionIpc } from './ipc/connectionHandlers'

const sanitizer = createSanitizer(process.env)
const config = new ConfigService()
let vault: CredentialVault
let connection: ConnectionService
let sessionManager: SessionManager
let store: Store | undefined

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.idris.nimbus')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  vault = new CredentialVault(join(app.getPath('userData'), 'credentials.enc.json'), safeStorage)
  connection = new ConnectionService(config, vault)
  sessionManager = new SessionManager(undefined, () => connection.buildSessionOptions())

  if (is.dev) {
    // 開発時の観測用。イベント本文は出さない（本文は §6-2 によりサニタイズ後のみ保存可）
    sessionManager.on('event', (event: { kind: string; sessionId: string }) => {
      console.log(`[nimbus:main] event kind=${event.kind} session=${event.sessionId.slice(0, 8)}`)
    })
  }

  // §6-2: DB への書き込みはサニタイザを通した単一書き込み点（Store.record）のみ
  store = new Store(join(app.getPath('userData'), 'nimbus.db'), sanitizer.sanitizeString)
  store.reconcileDanglingSessions()
  const storeRef = store
  sessionManager.on('event', (event) => {
    try {
      storeRef.record(event, sessionManager.get(event.sessionId))
    } catch (error) {
      console.error('[nimbus:main] failed to persist event', error)
    }
  })

  registerSessionIpc(sessionManager, store)
  registerConnectionIpc(config, vault, connection)
  createMainWindow()

  // E2E 起動確認用スモーク: NIMBUS_SMOKE=1 で 1 往復を自動実行する（docs/testing 参照）
  if (process.env['NIMBUS_SMOKE'] === '1') {
    setTimeout(() => {
      void sessionManager.createSession({
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

app.on('before-quit', () => {
  // 全セッションの入力を閉じ、CLI サブプロセスを解放する
  sessionManager?.closeAll()
})

app.on('quit', () => {
  store?.close()
})
