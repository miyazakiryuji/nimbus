import { join } from 'path'
import { app, BrowserWindow, safeStorage } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { themeSchema } from '@shared/theme'
import { createMainWindow } from './window'
import { SessionManager } from './services/SessionManager'
import { createSanitizer } from './services/sanitizer'
import { ConfigService } from './services/ConfigService'
import { CredentialVault } from './services/CredentialVault'
import { ConnectionService } from './services/ConnectionService'
import { PermissionBroker } from './services/PermissionBroker'
import { ThemeService } from './services/ThemeService'
import { Store } from './db/Store'
import { registerSessionIpc } from './ipc/sessionHandlers'
import { registerConnectionIpc } from './ipc/connectionHandlers'
import { registerApprovalIpc } from './ipc/approvalHandlers'
import { registerThemeIpc } from './ipc/themeHandlers'
import nimbusDark from '../../themes/nimbus-dark.json'
import nimbusLight from '../../themes/nimbus-light.json'
import cumulonimbus from '../../themes/cumulonimbus.json'

// テスト・撮影用: userData を隔離する（通常起動では未使用）
if (process.env['NIMBUS_USERDATA']) {
  app.setPath('userData', process.env['NIMBUS_USERDATA'])
}

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
  const broker = new PermissionBroker()
  sessionManager = new SessionManager(
    undefined,
    () => connection.buildSessionOptions(),
    (sessionId, cwd) => broker.createCanUseTool(sessionId, cwd)
  )
  registerApprovalIpc(broker)

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
  const themeService = new ThemeService(
    {
      'nimbus-dark': themeSchema.parse(nimbusDark),
      'nimbus-light': themeSchema.parse(nimbusLight),
      cumulonimbus: themeSchema.parse(cumulonimbus)
    },
    config.userThemesDir
  )
  registerThemeIpc(config, themeService)
  createMainWindow()

  // E2E 起動確認用スモーク: NIMBUS_SMOKE=1 で 1 往復を自動実行する（docs/testing 参照）
  // NIMBUS_SMOKE_SAFE=1 は撮影用: コアツールのみ・MCP/プラグイン読み込みなし（個人情報の写り込み防止）
  if (process.env['NIMBUS_SMOKE'] === '1') {
    setTimeout(() => {
      sessionManager
        .createSession({
          cwd: process.env['NIMBUS_SMOKE_CWD'] ?? process.cwd(),
          firstMessage: process.env['NIMBUS_SMOKE_PROMPT'] ?? 'Reply with exactly: NIMBUS_OK',
          ...(process.env['NIMBUS_SMOKE_SAFE'] === '1'
            ? {
                extraOptions: {
                  settingSources: [],
                  tools: { type: 'preset' as const, preset: 'claude_code' as const },
                  mcpServers: {},
                  strictMcpConfig: true
                }
              }
            : {})
        })
        .catch((error) => console.error('[nimbus:main] smoke session failed', error))
    }, 3000)
  }

  // README 用スクリーンショット撮影（開発時のみ・指定時のみ）
  const screenshotPath = process.env['NIMBUS_SCREENSHOT']
  if (screenshotPath) {
    setTimeout(
      async () => {
        const window = BrowserWindow.getAllWindows()[0]
        if (window) {
          const image = await window.webContents.capturePage()
          const { writeFileSync } = await import('fs')
          writeFileSync(screenshotPath, image.toPNG())
          console.log(`[nimbus] screenshot saved: ${screenshotPath}`)
        }
      },
      Number(process.env['NIMBUS_SCREENSHOT_DELAY_MS'] ?? 20_000)
    )
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
