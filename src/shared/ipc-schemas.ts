import { z } from 'zod'

/** IPC 入出力の zod スキーマ（§3 設計原則 2）。メインプロセス側で必ず parse する */
export const sessionCreateRequestSchema = z.object({
  cwd: z.string().optional(),
  firstMessage: z.string().min(1)
})

export const sessionSendRequestSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1)
})

export const sessionInterruptRequestSchema = z.object({
  sessionId: z.string().uuid()
})

export const sessionCloseRequestSchema = z.object({
  sessionId: z.string().uuid()
})

export const sessionEventsRequestSchema = z.object({
  sessionId: z.string().uuid()
})

export const sessionResumeRequestSchema = z.object({
  sessionId: z.string().uuid()
})

export const connectionSaveProfileRequestSchema = z.object({
  profile: z.unknown(),
  secret: z.string().min(1).optional()
})

export const connectionProfileIdRequestSchema = z.object({
  profileId: z.string().uuid()
})

export const connectionSetActiveRequestSchema = z.object({
  profileId: z.string().uuid().nullable()
})

export const contextClaudeMdRequestSchema = z.object({
  sessionId: z.string().uuid()
})

export const approvalsApproveRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  always: z.enum(['session', 'workspace']).optional()
})

export const approvalsDenyRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1)
})

export const gitCwdRequestSchema = z.object({
  cwd: z.string().min(1)
})

export const gitFileRequestSchema = z.object({
  cwd: z.string().min(1),
  path: z.string().min(1)
})

export const gitCheckpointRequestSchema = z.object({
  cwd: z.string().min(1),
  label: z.string().min(1).max(100)
})

export const gitRestoreRequestSchema = z.object({
  cwd: z.string().min(1),
  hash: z.string().regex(/^[0-9a-f]{7,40}$/i)
})

export const gitPathsRequestSchema = z.object({
  cwd: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1)
})

export const gitCommitRequestSchema = z.object({
  cwd: z.string().min(1),
  message: z.string().min(1).max(5000)
})

export const claudeMdEntrySchema = z.object({
  path: z.string(),
  scope: z.enum(['user', 'project', 'parent'])
})

export const themeSetSelectedRequestSchema = z.object({
  selected: z.string().min(1)
})

export const settingsSaveFontRequestSchema = z.object({
  font: z.object({
    fontFamily: z.string().optional(),
    fontSize: z.number().min(8).max(32).optional(),
    lineHeight: z.number().min(1).max(3).optional()
  })
})
