import { z } from 'zod'

/** F-4 GUI 差分レビューの共有型 */

export const gitFileChangeSchema = z.object({
  path: z.string(),
  /** git status の index 側ステータス（M/A/D/R/? など） */
  index: z.string(),
  /** git status の working tree 側ステータス */
  workingDir: z.string()
})
export type GitFileChange = z.infer<typeof gitFileChangeSchema>

export const gitStatusResultSchema = z.object({
  isRepo: z.boolean(),
  branch: z.string().optional(),
  files: z.array(gitFileChangeSchema)
})
export type GitStatusResult = z.infer<typeof gitStatusResultSchema>

export const gitFileDiffSchema = z.object({
  path: z.string(),
  before: z.string(),
  after: z.string()
})
export type GitFileDiff = z.infer<typeof gitFileDiffSchema>

export const gitCheckpointSchema = z.object({
  hash: z.string(),
  label: z.string(),
  isCheckpoint: z.boolean().optional(),
  createdAt: z.number()
})
export type GitCheckpoint = z.infer<typeof gitCheckpointSchema>
