import { dialog, ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { gitCheckpointSchema, gitFileDiffSchema, gitStatusResultSchema } from '@shared/review'
import {
  gitCheckpointRequestSchema,
  gitCwdRequestSchema,
  gitFileRequestSchema,
  gitRestoreRequestSchema
} from '@shared/ipc-schemas'
import type { GitService } from '../services/GitService'
import type { Store } from '../db/Store'

/** F-4 差分レビュー＋ワークスペース選択の IPC */
export function registerReviewIpc(git: GitService, store: Store): void {
  ipcMain.handle(IPC_CHANNELS.workspaceOpen, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'ワークスペースを開く'
    })
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    const path = result.filePaths[0]
    store.touchWorkspace(path)
    return { path }
  })

  ipcMain.handle(IPC_CHANNELS.gitStatus, async (_event, raw: unknown) => {
    const req = gitCwdRequestSchema.parse(raw)
    return gitStatusResultSchema.parse(await git.status(req.cwd))
  })

  ipcMain.handle(IPC_CHANNELS.gitDiffFile, async (_event, raw: unknown) => {
    const req = gitFileRequestSchema.parse(raw)
    return gitFileDiffSchema.parse(await git.diffFile(req.cwd, req.path))
  })

  ipcMain.handle(IPC_CHANNELS.gitCheckpoint, async (_event, raw: unknown) => {
    const req = gitCheckpointRequestSchema.parse(raw)
    return gitCheckpointSchema.parse(await git.createCheckpoint(req.cwd, req.label))
  })

  ipcMain.handle(IPC_CHANNELS.gitHistory, async (_event, raw: unknown) => {
    const req = gitCwdRequestSchema.parse(raw)
    return z.array(gitCheckpointSchema).parse(await git.listHistory(req.cwd))
  })

  ipcMain.handle(IPC_CHANNELS.gitRevertFile, async (_event, raw: unknown) => {
    const req = gitFileRequestSchema.parse(raw)
    await git.revertFile(req.cwd, req.path)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.gitRestore, async (_event, raw: unknown) => {
    const req = gitRestoreRequestSchema.parse(raw)
    await git.restoreCheckpoint(req.cwd, req.hash)
    return { ok: true }
  })
}
