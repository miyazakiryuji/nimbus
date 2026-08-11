/**
 * IPC チャネル名の定数。
 * 注意: このモジュールは preload にバンドルされるため、zod 等の外部依存を import しないこと
 * （sandbox 化された preload では外部モジュールの require が不可）。
 */
export const IPC_CHANNELS = {
  sessionCreate: 'nimbus:session:create',
  sessionSend: 'nimbus:session:send',
  sessionInterrupt: 'nimbus:session:interrupt',
  sessionClose: 'nimbus:session:close',
  sessionList: 'nimbus:session:list',
  /** DB に永続化された全セッション（過去分含む） */
  sessionHistory: 'nimbus:session:history',
  /** 指定セッションの永続化済みイベント列 */
  sessionEvents: 'nimbus:session:events',
  /** 過去セッションの再開（同じ Nimbus セッション ID で再アタッチ） */
  sessionResume: 'nimbus:session:resume',
  /** main → renderer への正規化イベント push */
  sessionEvent: 'nimbus:session:event',
  connectionState: 'nimbus:connection:state',
  connectionSaveProfile: 'nimbus:connection:save-profile',
  connectionDeleteProfile: 'nimbus:connection:delete-profile',
  connectionSetActive: 'nimbus:connection:set-active',
  connectionTest: 'nimbus:connection:test',
  contextClaudeMd: 'nimbus:context:claude-md',
  approvalsList: 'nimbus:approvals:list',
  approvalsApprove: 'nimbus:approvals:approve',
  approvalsDeny: 'nimbus:approvals:deny',
  /** main → renderer への承認キュー変更 push */
  approvalsChanged: 'nimbus:approvals:changed',
  themeState: 'nimbus:theme:state',
  themeSetSelected: 'nimbus:theme:set-selected',
  settingsSaveFont: 'nimbus:settings:save-font',
  /** main → renderer へのテーマ変更 push（ホットリロード・OS ダークモード追従） */
  themeChanged: 'nimbus:theme:changed'
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
export interface SessionCloseRequest {
  sessionId: string
}
export interface SessionEventsRequest {
  sessionId: string
}
export interface SessionResumeRequest {
  sessionId: string
}
/** プロファイル保存（secret は保存時のみ渡す。取得 API は存在しない） */
export interface ConnectionSaveProfileRequest {
  profile: unknown
  secret?: string
}
export interface ConnectionProfileIdRequest {
  profileId: string
}
export interface ConnectionSetActiveRequest {
  profileId: string | null
}
export interface ThemeSetSelectedRequest {
  selected: string
}
export interface ApprovalsApproveRequest {
  ids: string[]
  always?: 'session' | 'workspace'
}
export interface ApprovalsDenyRequest {
  ids: string[]
}
export interface SettingsSaveFontRequest {
  font: { fontFamily?: string; fontSize?: number; lineHeight?: number }
}
