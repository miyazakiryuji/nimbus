import { z } from 'zod'

/** IDE のファイルツリー／エディタで扱う型 */

export const fileEntrySchema = z.object({
  name: z.string(),
  /** ルートからの相対パス */
  path: z.string(),
  isDirectory: z.boolean(),
  size: z.number().optional()
})
export type FileEntry = z.infer<typeof fileEntrySchema>

export const directoryListingSchema = z.object({
  root: z.string(),
  /** ルートからの相対パス（ルート自身は ''） */
  path: z.string(),
  entries: z.array(fileEntrySchema),
  /** 上限で打ち切った場合 true */
  truncated: z.boolean()
})
export type DirectoryListing = z.infer<typeof directoryListingSchema>

export const fileContentSchema = z.object({
  root: z.string(),
  path: z.string(),
  content: z.string(),
  /** バイナリと判定した場合は content 空・編集不可 */
  binary: z.boolean(),
  /** サイズ上限超過で読み込まなかった場合 */
  tooLarge: z.boolean(),
  size: z.number()
})
export type FileContent = z.infer<typeof fileContentSchema>

export const filesChangedSchema = z.object({
  root: z.string(),
  /** 変更のあった相対パス（ディレクトリ名のみのこともある） */
  paths: z.array(z.string())
})
export type FilesChanged = z.infer<typeof filesChangedSchema>
