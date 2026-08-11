import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { taskSchema, type KanbanTask } from '@shared/tasks'
import { taskCreateRequestSchema, taskIdRequestSchema } from '@shared/ipc-schemas'
import type { TaskService } from '../services/TaskService'
import { broadcastToWindows } from './broadcast'

const taskListSchema = z.array(taskSchema)

/** F-5 カンバンの IPC */
export function registerTaskIpc(tasks: TaskService): void {
  ipcMain.handle(IPC_CHANNELS.taskList, () => taskListSchema.parse(tasks.list()))

  ipcMain.handle(IPC_CHANNELS.taskCreate, async (_event, raw: unknown) => {
    const req = taskCreateRequestSchema.parse(raw)
    return taskSchema.parse(await tasks.createTask(req))
  })

  ipcMain.handle(IPC_CHANNELS.taskStart, async (_event, raw: unknown) => {
    const req = taskIdRequestSchema.parse(raw)
    return tasks.startTask(req.taskId)
  })

  ipcMain.handle(IPC_CHANNELS.taskComplete, async (_event, raw: unknown) => {
    const req = taskIdRequestSchema.parse(raw)
    await tasks.completeTask(req.taskId)
    return { ok: true }
  })

  tasks.on('changed', (list: KanbanTask[]) => {
    broadcastToWindows(IPC_CHANNELS.tasksChanged, taskListSchema.parse(list))
  })
}
