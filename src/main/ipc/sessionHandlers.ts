import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { nimbusEventSchema, persistedSessionSchema, sessionSummarySchema } from '@shared/events'
import {
  claudeMdEntrySchema,
  contextClaudeMdRequestSchema,
  sessionCloseRequestSchema,
  sessionCreateRequestSchema,
  sessionEventsRequestSchema,
  sessionInterruptRequestSchema,
  sessionResumeRequestSchema,
  sessionSendRequestSchema
} from '@shared/ipc-schemas'
import type { SessionManager } from '../services/SessionManager'
import type { Store } from '../db/Store'
import type { WorkspaceRegistry } from '../services/WorkspaceRegistry'
import { findClaudeMdChain } from '../services/claudeMd'
import { broadcastToWindows } from './broadcast'

const sessionListResponseSchema = z.array(sessionSummarySchema)
const sessionHistoryResponseSchema = z.array(persistedSessionSchema)
const sessionEventsResponseSchema = z.array(nimbusEventSchema)

/**
 * セッション関連 IPC の登録。
 * §3 設計原則 2: リクエストは受信時に parse、レスポンス・push イベントも送出前に parse する。
 * イベントは全ウィンドウへブロードキャストする（多重ウィンドウ前提）。
 */
export function registerSessionIpc(
  manager: SessionManager,
  store: Store,
  registry: WorkspaceRegistry
): void {
  ipcMain.handle(IPC_CHANNELS.sessionCreate, async (_event, raw: unknown) => {
    const req = sessionCreateRequestSchema.parse(raw)
    // renderer 由来の cwd は「開いたワークスペース」に限定する（§6 多層防御）
    if (req.cwd) registry.assertAllowed(req.cwd)
    const sessionId = await manager.createSession(req)
    if (req.cwd) store.touchWorkspace(req.cwd)
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

  ipcMain.handle(IPC_CHANNELS.sessionHistory, () =>
    sessionHistoryResponseSchema.parse(store.listSessions())
  )

  ipcMain.handle(IPC_CHANNELS.sessionEvents, (_event, raw: unknown) => {
    const req = sessionEventsRequestSchema.parse(raw)
    return sessionEventsResponseSchema.parse(store.getEvents(req.sessionId))
  })

  ipcMain.handle(IPC_CHANNELS.sessionResume, async (_event, raw: unknown) => {
    const req = sessionResumeRequestSchema.parse(raw)
    if (manager.isActive(req.sessionId)) {
      return { sessionId: req.sessionId }
    }
    const persisted = store.getSession(req.sessionId)
    if (!persisted) {
      throw new Error(`Unknown session: ${req.sessionId}`)
    }
    const sessionId = await manager.createSession({
      reuseSessionId: persisted.sessionId,
      cwd: persisted.cwd,
      resumeClaudeSessionId: persisted.claudeSessionId
    })
    return { sessionId }
  })

  ipcMain.handle(IPC_CHANNELS.contextClaudeMd, (_event, raw: unknown) => {
    const req = contextClaudeMdRequestSchema.parse(raw)
    const cwd = manager.get(req.sessionId)?.cwd ?? store.getSession(req.sessionId)?.cwd
    if (!cwd) return []
    // NIMBUS_CLAUDEMD_HOME はテスト・撮影用のホーム差し替え（通常起動では未指定）
    const home = process.env['NIMBUS_CLAUDEMD_HOME']
    return z
      .array(claudeMdEntrySchema)
      .parse(home ? findClaudeMdChain(cwd, home) : findClaudeMdChain(cwd))
  })

  manager.on('event', (event: unknown) => {
    // 送出前にもスキーマ検証（正規化層のバグを IPC 境界で検出する）
    const parsed = nimbusEventSchema.parse(event)
    broadcastToWindows(IPC_CHANNELS.sessionEvent, parsed)
  })
}
