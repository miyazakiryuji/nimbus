import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  type ApprovalsApproveRequest,
  type ApprovalsDenyRequest,
  type ConnectionProfileIdRequest,
  type GitCheckpointRequest,
  type GitCommitRequest,
  type GitCwdRequest,
  type GitFileRequest,
  type GitPathsRequest,
  type GitRestoreRequest,
  type ConnectionSaveProfileRequest,
  type ConnectionSetActiveRequest,
  type SessionCloseRequest,
  type SessionCreateRequest,
  type SessionCreateResponse,
  type SessionEventsRequest,
  type SessionInterruptRequest,
  type SessionResumeRequest,
  type SessionSendRequest,
  type SettingsSaveFontRequest,
  type ThemeSetSelectedRequest
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
  },
  connection: {
    getState: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.connectionState),
    saveProfile: (req: ConnectionSaveProfileRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.connectionSaveProfile, req),
    deleteProfile: (req: ConnectionProfileIdRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.connectionDeleteProfile, req),
    setActive: (req: ConnectionSetActiveRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.connectionSetActive, req),
    test: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.connectionTest)
  },
  context: {
    claudeMd: (req: SessionEventsRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.contextClaudeMd, req)
  },
  approvals: {
    list: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.approvalsList),
    approve: (req: ApprovalsApproveRequest): Promise<{ count: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.approvalsApprove, req),
    deny: (req: ApprovalsDenyRequest): Promise<{ count: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.approvalsDeny, req),
    onChanged: (callback: (list: unknown) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: unknown): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.approvalsChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.approvalsChanged, listener)
      }
    }
  },
  workspace: {
    open: (): Promise<{ path: string | null }> => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpen)
  },
  git: {
    status: (req: GitCwdRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitStatus, req),
    diffFile: (req: GitFileRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitDiffFile, req),
    checkpoint: (req: GitCheckpointRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitCheckpoint, req),
    history: (req: GitCwdRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitHistory, req),
    revertFile: (req: GitFileRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitRevertFile, req),
    restore: (req: GitRestoreRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitRestore, req),
    stage: (req: GitPathsRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitStage, req),
    unstage: (req: GitPathsRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitUnstage, req),
    stageAll: (req: GitCwdRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitStageAll, req),
    unstageAll: (req: GitCwdRequest): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitUnstageAll, req),
    commit: (req: GitCommitRequest): Promise<{ hash: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitCommit, req),
    generateCommitMessage: (req: GitCwdRequest): Promise<{ message: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.gitGenerateCommitMessage, req)
  },
  diag: {
    info: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.diagInfo),
    logs: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.diagLogs),
    clear: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.diagClear)
  },
  theme: {
    getState: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.themeState),
    setSelected: (req: ThemeSetSelectedRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.themeSetSelected, req),
    saveFont: (req: SettingsSaveFontRequest): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSaveFont, req),
    onChanged: (callback: (state: unknown) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: unknown): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.themeChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.themeChanged, listener)
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
