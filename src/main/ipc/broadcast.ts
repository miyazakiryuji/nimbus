import { BrowserWindow } from 'electron'

/**
 * 全ウィンドウへの安全な push 送信。
 * シャットダウン中に renderer が先に死ぬと webContents.send が throw し、
 * 同期 emit 経由で SessionManager.pump まで汚染し得る（E2E ログで実際に観測）。
 * 破棄済みウィンドウはスキップし、競合による例外は握りつぶす。
 */
export function broadcastToWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    try {
      window.webContents.send(channel, payload)
    } catch {
      // ウィンドウ破棄タイミングとの競合は無視する
    }
  }
}
