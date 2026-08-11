import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { directoryListingSchema, fileContentSchema } from '@shared/files'
import {
  filesListRequestSchema,
  filesReadRequestSchema,
  filesWriteRequestSchema
} from '@shared/ipc-schemas'
import type { FileService } from '../services/FileService'
import type { FileWatcher } from '../services/FileWatcher'
import type { WorkspaceRegistry } from '../services/WorkspaceRegistry'

const writeResponseSchema = z.object({ size: z.number() })

/**
 * IDE のファイル IPC（§3 原則 2: 入出力とも zod 検証）。
 * §6: root は WorkspaceRegistry で許可されたものだけ、相対パスは FileService が検証する。
 */
export function registerFileIpc(
  files: FileService,
  registry: WorkspaceRegistry,
  watcher: FileWatcher
): void {
  ipcMain.handle(IPC_CHANNELS.filesList, async (_event, raw: unknown) => {
    const req = filesListRequestSchema.parse(raw)
    registry.assertAllowed(req.root)
    // 閲覧を始めたルートから監視を開始する（Claude の編集を検知するため）
    watcher.ensure(req.root)
    return directoryListingSchema.parse(await files.list(req.root, req.path))
  })

  ipcMain.handle(IPC_CHANNELS.filesRead, async (_event, raw: unknown) => {
    const req = filesReadRequestSchema.parse(raw)
    registry.assertAllowed(req.root)
    return fileContentSchema.parse(await files.read(req.root, req.path))
  })

  ipcMain.handle(IPC_CHANNELS.filesWrite, async (_event, raw: unknown) => {
    const req = filesWriteRequestSchema.parse(raw)
    registry.assertAllowed(req.root)
    return writeResponseSchema.parse(await files.write(req.root, req.path, req.content))
  })
}
