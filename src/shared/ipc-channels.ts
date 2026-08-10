/**
 * IPC チャネル名の定数。
 * 注意: このモジュールは preload にバンドルされるため、zod 等の外部依存を import しないこと
 * （sandbox 化された preload では外部モジュールの require が不可）。
 */
export const IPC_CHANNELS = {
  sessionCreate: 'nimbus:session:create',
  sessionSend: 'nimbus:session:send',
  sessionInterrupt: 'nimbus:session:interrupt',
  sessionList: 'nimbus:session:list',
  /** main → renderer への正規化イベント push */
  sessionEvent: 'nimbus:session:event'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

/** IPC リクエスト/レスポンスの型（zod スキーマ本体は shared/ipc-schemas.ts。preload はこの型のみ参照） */
export interface SessionCreateRequest {
  cwd?: string
  firstMessage: string
}
export interface SessionCreateResponse {
  sessionId: string
}
export interface SessionSendRequest {
  sessionId: string
  text: string
}
export interface SessionInterruptRequest {
  sessionId: string
}
