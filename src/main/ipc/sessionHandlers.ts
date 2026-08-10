import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { nimbusEventSchema, sessionSummarySchema } from '@shared/events'
import {
  sessionCloseRequestSchema,
  sessionCreateRequestSchema,
  sessionInterruptRequestSchema,
  sessionSendRequestSchema
} from '@shared/ipc-schemas'
import type { SessionManager } from '../services/SessionManager'

const sessionListResponseSchema = z.array(sessionSummarySchema)

/**
 * セッション関連 IPC の登録。
 * §3 設計原則 2: リクエストは受信時に parse、レスポンス・push イベントも送出前に parse する。
 * イベントは全ウィンドウへブロードキャストする（多重ウィンドウ前提）。
 */
export function registerSessionIpc(manager: SessionManager): void {
  ipcMain.handle(IPC_CHANNELS.sessionCreate, (_event, raw: unknown) => {
    const req = sessionCreateRequestSchema.parse(raw)
    const sessionId = manager.createSession(req)
    return { sessionId }
  })

  ipcMain.handle(IPC_CHANNELS.sessionSend, (_event, raw: unknown) => {
    const req = sessionSendRequestSchema.parse(raw)
    manager.sendMessage(req.sessionId, req.text)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.sessionInterrupt, async (_event, raw: unknown) => {
    const req = sessionInterruptRequestSchema.parse(raw)
    await manager.interrupt(req.sessionId)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.sessionClose, (_event, raw: unknown) => {
    const req = sessionCloseRequestSchema.parse(raw)
    manager.close(req.sessionId)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.sessionList, () => sessionListResponseSchema.parse(manager.list()))

  manager.on('event', (event: unknown) => {
    // 送出前にもスキーマ検証（正規化層のバグを IPC 境界で検出する）
    const parsed = nimbusEventSchema.parse(event)
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.sessionEvent, parsed)
    }
  })
}
