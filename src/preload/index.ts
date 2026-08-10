import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  type SessionCloseRequest,
  type SessionCreateRequest,
  type SessionCreateResponse,
  type SessionEventsRequest,
  type SessionInterruptRequest,
  type SessionResumeRequest,
  type SessionSendRequest
} from '../shared/ipc-channels'

// §3 設計原則 1: raw な ipcRenderer は公開せず、型付きのホワイトリスト API のみを公開する。
// 注意: sandbox 化 preload では外部モジュール（zod 等）を require できないため、
// ここでは ipc-channels（依存なし）だけを import する。スキーマ検証はメイン側で行う。
const nimbus = {
  platform: process.platform,
  sessions: {
    create: (req: SessionCreateRequest): Promise<SessionCreateResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionCreate, req),
    send: (req: SessionSendRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionSend, req),
    interrupt: (req: SessionInterruptRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionInterrupt, req),
    close: (req: SessionCloseRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionClose, req),
    list: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.sessionList),
    history: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.sessionHistory),
    events: (req: SessionEventsRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionEvents, req),
    resume: (req: SessionResumeRequest): Promise<SessionCreateResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionResume, req),
    onEvent: (callback: (event: unknown) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: unknown): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.sessionEvent, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.sessionEvent, listener)
      }
    }
  }
} as const

export type NimbusApi = typeof nimbus

if (import.meta.env.DEV) {
  // 起動確認チェックリスト用: sandbox / contextIsolation の実効値を出力する
  console.log(
    `[nimbus:preload] sandboxed=${process.sandboxed} contextIsolated=${process.contextIsolated}`
  )
}

if (!process.contextIsolated) {
  throw new Error('contextIsolation must be enabled (NIMBUS_SPEC §6-5)')
}

contextBridge.exposeInMainWorld('nimbus', nimbus)
