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
