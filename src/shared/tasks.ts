import { z } from 'zod'

/** F-5: タスク＝worktree＝セッション（1:1:1）のカンバン */

export const kanbanStateSchema = z.enum([
  /** 待機中（セッション未開始 or 同時実行上限待ち） */
  'pending',
  /** 実行中 */
  'running',
  /** 承認待ち（受信箱に保留あり） */
  'awaiting-approval',
  /** レビュー待ち（ターン完了・人間の番） */
  'review',
  /** 完了（worktree 破棄済み） */
  'done'
])
export type KanbanState = z.infer<typeof kanbanStateSchema>

export const taskSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  repoCwd: z.string(),
  worktreePath: z.string(),
  branch: z.string(),
  prompt: z.string(),
  sessionId: z.string().optional(),
  state: kanbanStateSchema,
  createdAt: z.number(),
  updatedAt: z.number()
})
export type KanbanTask = z.infer<typeof taskSchema>

export const KANBAN_COLUMNS: Array<{ state: KanbanState; label: string }> = [
  { state: 'pending', label: '待機中' },
  { state: 'running', label: '実行中' },
  { state: 'awaiting-approval', label: '承認待ち' },
  { state: 'review', label: 'レビュー待ち' },
  { state: 'done', label: '完了' }
]
