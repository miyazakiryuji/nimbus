import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { taskSchema, type KanbanTask } from '@shared/tasks'
import { taskCreateRequestSchema, taskIdRequestSchema } from '@shared/ipc-schemas'
import type { TaskService } from '../services/TaskService'
import type { WorkspaceRegistry } from '../services/WorkspaceRegistry'
import { broadcastToWindows } from './broadcast'

const taskListSchema = z.array(taskSchema)
const taskStartResponseSchema = z.object({ started: z.boolean(), reason: z.string().optional() })

/** F-5 カンバンの IPC */
export function registerTaskIpc(tasks: TaskService, registry: WorkspaceRegistry): void {
  ipcMain.handle(IPC_CHANNELS.taskList, () => taskListSchema.parse(tasks.list()))

  ipcMain.handle(IPC_CHANNELS.taskCreate, async (_event, raw: unknown) => {
    const req = taskCreateRequestSchema.parse(raw)
    registry.assertAllowed(req.repoCwd)
    const task = await tasks.createTask(req)
    // 生成した worktree もエクスプローラー/レビューの対象として登録する
    registry.register(task.worktreePath)
    return taskSchema.parse(task)
  })

  ipcMain.handle(IPC_CHANNELS.taskStart, async (_event, raw: unknown) => {
    const req = taskIdRequestSchema.parse(raw)
    return taskStartResponseSchema.parse(await tasks.startTask(req.taskId))
  })

  ipcMain.handle(IPC_CHANNELS.taskComplete, async (_event, raw: unknown) => {
    const req = taskIdRequestSchema.parse(raw)
    const { wipCommit } = await tasks.completeTask(req.taskId)
    return { ok: true, wipCommit }
  })

  tasks.on('changed', (list: KanbanTask[]) => {
    broadcastToWindows(IPC_CHANNELS.tasksChanged, taskListSchema.parse(list))
  })
}
