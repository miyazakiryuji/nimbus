import { dialog, ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { gitCheckpointSchema, gitFileDiffSchema, gitStatusResultSchema } from '@shared/review'
import {
  gitCheckpointRequestSchema,
  gitCommitRequestSchema,
  gitCwdRequestSchema,
  gitFileRequestSchema,
  gitPathsRequestSchema,
  gitRestoreRequestSchema
} from '@shared/ipc-schemas'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { GitService } from '../services/GitService'
import type { Store } from '../db/Store'
import type { WorkspaceRegistry } from '../services/WorkspaceRegistry'
import { generateCommitMessage } from '../services/commitMessage'

/** F-4 差分レビュー＋SCM（Git ツリー）＋ワークスペース選択の IPC */
export function registerReviewIpc(
  git: GitService,
  store: Store,
  registry: WorkspaceRegistry,
  optionsProvider?: () => Promise<Partial<Options>>
): void {
  /** git 操作の cwd も「ユーザーが開いた場所」に限定する（§6 多層防御） */
  const allow = (cwd: string): string => {
    registry.assertAllowed(cwd)
    return cwd
  }

  const workspaceOpenResponseSchema = z.object({ path: z.string().nullable() })
  const gitCommitResponseSchema = z.object({ hash: z.string() })
  const generateCommitResponseSchema = z.object({ message: z.string() })

  ipcMain.handle(IPC_CHANNELS.workspaceOpen, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'ワークスペースを開く'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return workspaceOpenResponseSchema.parse({ path: null })
    }
    const path = result.filePaths[0]
    store.touchWorkspace(path)
    return workspaceOpenResponseSchema.parse({ path })
  })

  ipcMain.handle(IPC_CHANNELS.gitStatus, async (_event, raw: unknown) => {
    const req = gitCwdRequestSchema.parse(raw)
    return gitStatusResultSchema.parse(await git.status(allow(req.cwd)))
  })

  ipcMain.handle(IPC_CHANNELS.gitDiffFile, async (_event, raw: unknown) => {
    const req = gitFileRequestSchema.parse(raw)
    return gitFileDiffSchema.parse(await git.diffFile(allow(req.cwd), req.path))
  })

  ipcMain.handle(IPC_CHANNELS.gitCheckpoint, async (_event, raw: unknown) => {
    const req = gitCheckpointRequestSchema.parse(raw)
    return gitCheckpointSchema.parse(await git.createCheckpoint(allow(req.cwd), req.label))
  })

  ipcMain.handle(IPC_CHANNELS.gitHistory, async (_event, raw: unknown) => {
    const req = gitCwdRequestSchema.parse(raw)
    return z.array(gitCheckpointSchema).parse(await git.listHistory(allow(req.cwd)))
  })

  ipcMain.handle(IPC_CHANNELS.gitRevertFile, async (_event, raw: unknown) => {
    const req = gitFileRequestSchema.parse(raw)
    await git.revertFile(allow(req.cwd), req.path)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.gitRestore, async (_event, raw: unknown) => {
    const req = gitRestoreRequestSchema.parse(raw)
    await git.restoreCheckpoint(allow(req.cwd), req.hash)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.gitStage, async (_event, raw: unknown) => {
    const req = gitPathsRequestSchema.parse(raw)
    await git.stage(allow(req.cwd), req.paths)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.gitUnstage, async (_event, raw: unknown) => {
    const req = gitPathsRequestSchema.parse(raw)
    await git.unstage(allow(req.cwd), req.paths)
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.gitStageAll, async (_event, raw: unknown) => {
    const req = gitCwdRequestSchema.parse(raw)
    await git.stageAll(allow(req.cwd))
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.gitUnstageAll, async (_event, raw: unknown) => {
    const req = gitCwdRequestSchema.parse(raw)
    await git.unstageAll(allow(req.cwd))
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.gitCommit, async (_event, raw: unknown) => {
    const req = gitCommitRequestSchema.parse(raw)
    return gitCommitResponseSchema.parse(await git.commit(allow(req.cwd), req.message))
  })

  ipcMain.handle(IPC_CHANNELS.gitGenerateCommitMessage, async (_event, raw: unknown) => {
    const req = gitCwdRequestSchema.parse(raw)
    const message = await generateCommitMessage(allow(req.cwd), git, optionsProvider)
    return generateCommitResponseSchema.parse({ message })
  })
}
