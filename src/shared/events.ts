import { z } from 'zod'

/**
 * Nimbus 正規化イベント（§3 設計原則 3）。
 * SDK の生ストリームはメインプロセスでこの型に正規化してから Renderer / DB へ流す。
 * 全イベントが sessionId（Nimbus 内部 ID）を持つ（§3 設計原則 5: 多重セッション前提）。
 *
 * 根拠となる SDK 型は @anthropic-ai/claude-agent-sdk 0.3.226 の sdk.d.ts を直接確認済み
 * （docs/research/sdk-verification-2026-08-11.json も参照）。
 */

export const sessionStatusSchema = z.enum([
  'starting',
  'running',
  'awaiting-input',
  'interrupted',
  'completed',
  'error'
])
export type SessionStatus = z.infer<typeof sessionStatusSchema>

const base = {
  sessionId: z.string(),
  timestamp: z.number()
}

export const nimbusEventSchema = z.discriminatedUnion('kind', [
  // SDK init メッセージ（type:'system', subtype:'init'）由来
  z.object({
    ...base,
    kind: z.literal('session-init'),
    claudeSessionId: z.string(),
    claudeCodeVersion: z.string(),
    model: z.string(),
    cwd: z.string(),
    permissionMode: z.string(),
    // SDK 実測 enum: 'user' | 'project' | 'org' | 'temporary' | 'oauth'（F-7 課金モード表示に使用）
    apiKeySource: z.string(),
    tools: z.array(z.string()),
    mcpServers: z.array(z.object({ name: z.string(), status: z.string() })),
    plugins: z.array(z.object({ name: z.string(), version: z.string().optional() })),
    skills: z.array(z.string()),
    slashCommands: z.array(z.string()),
    agents: z.array(z.string()).optional()
  }),
  // ユーザー入力（Nimbus 自身が送信したもの。メインプロセスが正とする）
  z.object({
    ...base,
    kind: z.literal('user-text'),
    text: z.string()
  }),
  z.object({
    ...base,
    kind: z.literal('assistant-text'),
    text: z.string()
  }),
  z.object({
    ...base,
    kind: z.literal('assistant-thinking'),
    text: z.string()
  }),
  z.object({
    ...base,
    kind: z.literal('tool-use'),
    toolUseId: z.string(),
    toolName: z.string(),
    input: z.unknown()
  }),
  z.object({
    ...base,
    kind: z.literal('tool-result'),
    toolUseId: z.string(),
    isError: z.boolean(),
    preview: z.string()
  }),
  // SDK result メッセージ由来（sdk.d.ts 実測仕様）:
  // - totalCostUsd: セッション内累積（クラッシュ系はゼロあり→消費側で単調ガード）
  // - usage: そのターンのみ・メインループのみ（累積ではない。正確な集計は将来 modelUsage を使う）
  z.object({
    ...base,
    kind: z.literal('turn-result'),
    subtype: z.string(),
    isError: z.boolean(),
    numTurns: z.number(),
    durationMs: z.number(),
    totalCostUsd: z.number().optional(),
    usage: z
      .object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        cacheCreationInputTokens: z.number().optional(),
        cacheReadInputTokens: z.number().optional()
      })
      .optional(),
    resultText: z.string().optional()
  }),
  z.object({
    ...base,
    kind: z.literal('status'),
    status: sessionStatusSchema,
    detail: z.string().optional()
  }),
  z.object({
    ...base,
    kind: z.literal('session-error'),
    message: z.string()
  })
])

export type NimbusEvent = z.infer<typeof nimbusEventSchema>
export type NimbusEventKind = NimbusEvent['kind']

/** セッション一覧表示用のサマリ */
export const sessionSummarySchema = z.object({
  sessionId: z.string(),
  claudeSessionId: z.string().optional(),
  status: sessionStatusSchema,
  cwd: z.string(),
  model: z.string().optional(),
  createdAt: z.number(),
  totalCostUsd: z.number().optional()
})
export type SessionSummary = z.infer<typeof sessionSummarySchema>

/** DB に永続化されたセッション（過去分を含む） */
export const persistedSessionSchema = sessionSummarySchema.extend({
  updatedAt: z.number()
})
export type PersistedSession = z.infer<typeof persistedSessionSchema>
