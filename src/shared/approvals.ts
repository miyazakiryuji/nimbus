import { z } from 'zod'

/** F-3 承認インボックス。キューは全セッション横断の 1 本（§3 設計原則 5） */
export const approvalSummarySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  /** セッションの cwd（ワークスペース単位の自動承認ルールのキー） */
  cwd: z.string(),
  toolName: z.string(),
  /** 表示用に整形済みの引数プレビュー（切り詰め済み） */
  inputPreview: z.string(),
  /** 対象ファイルパス等（引数から抽出できた場合） */
  targetPath: z.string().optional(),
  createdAt: z.number()
})
export type ApprovalSummary = z.infer<typeof approvalSummarySchema>

export const approvalScopeSchema = z.enum(['session', 'workspace'])
export type ApprovalScope = z.infer<typeof approvalScopeSchema>
