import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type { NimbusEvent } from '@shared/events'
import type { KanbanState, KanbanTask } from '@shared/tasks'
import type { PermissionBroker } from './PermissionBroker'
import type { SessionManager } from './SessionManager'
import type { WorktreeManager } from './WorktreeManager'
import type { Store } from '../db/Store'

export interface CreateTaskInput {
  title: string
  prompt: string
  repoCwd: string
  autoStart: boolean
}

/**
 * F-5: タスク＝worktree＝セッション（1:1:1）のカンバン管理。
 * - 状態はセッション status と承認キューから導出する
 * - 同時実行数の上限（コスト暴走防止）を守り、空きが出たら待機中タスクを自動開始する
 */
export class TaskService extends EventEmitter {
  private tasks = new Map<string, KanbanTask>()

  constructor(
    private readonly store: Store,
    private readonly worktrees: WorktreeManager,
    private readonly sessions: SessionManager,
    private readonly broker: PermissionBroker,
    private readonly maxConcurrent: () => number
  ) {
    super()
    // 再起動後の復元: 実行系の状態はセッションが死んでいるため「レビュー待ち」へ倒す
    for (const task of store.listTasks()) {
      if (task.state === 'running' || task.state === 'awaiting-approval') {
        task.state = 'review'
      }
      this.tasks.set(task.taskId, task)
    }

    this.sessions.on('event', (event: NimbusEvent) => this.onSessionEvent(event))
    this.broker.on('changed', () => this.onApprovalsChanged())
  }

  list(): KanbanTask[] {
    return [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  async createTask(input: CreateTaskInput): Promise<KanbanTask> {
    const worktree = await this.worktrees.create(input.repoCwd, input.title)
    const task: KanbanTask = {
      taskId: randomUUID(),
      title: input.title,
      repoCwd: input.repoCwd,
      worktreePath: worktree.path,
      branch: worktree.branch,
      prompt: input.prompt,
      state: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    this.tasks.set(task.taskId, task)
    this.persistAndEmit(task)
    if (input.autoStart) {
      await this.startNextPending()
    }
    return task
  }

  /** 上限に空きがあれば指定タスク（省略時は最古の待機中）を開始する */
  async startTask(taskId: string): Promise<{ started: boolean; reason?: string }> {
    const task = this.mustGet(taskId)
    if (task.state !== 'pending') {
      return { started: false, reason: '待機中のタスクではありません' }
    }
    if (this.runningCount() >= this.maxConcurrent()) {
      return {
        started: false,
        reason: `同時実行上限（${this.maxConcurrent()}）に達しています。空きが出ると自動開始されます`
      }
    }
    const sessionId = await this.sessions.createSession({
      cwd: task.worktreePath,
      firstMessage: task.prompt
    })
    task.sessionId = sessionId
    this.setState(task, 'running')
    return { started: true }
  }

  /** 完了: セッションを閉じ、worktree を破棄（ブランチは残る） */
  async completeTask(taskId: string): Promise<void> {
    const task = this.mustGet(taskId)
    if (task.sessionId && this.sessions.isActive(task.sessionId)) {
      try {
        this.sessions.close(task.sessionId)
      } catch {
        // すでに閉じている場合は無視
      }
    }
    try {
      await this.worktrees.remove(task.repoCwd, task.worktreePath)
    } catch (error) {
      // worktree が手動で消されている場合等は続行（状態だけ完了へ）
      console.warn('[nimbus:tasks] worktree remove failed', error)
    }
    this.setState(task, 'done')
    await this.startNextPending()
  }

  private runningCount(): number {
    return this.list().filter((t) => t.state === 'running' || t.state === 'awaiting-approval')
      .length
  }

  private async startNextPending(): Promise<void> {
    while (this.runningCount() < this.maxConcurrent()) {
      const next = this.list().find((t) => t.state === 'pending')
      if (!next) return
      const result = await this.startTask(next.taskId)
      if (!result.started) return
    }
  }

  private onSessionEvent(event: NimbusEvent): void {
    const task = this.list().find((t) => t.sessionId === event.sessionId)
    if (!task || task.state === 'done') return
    if (event.kind === 'status') {
      if (event.status === 'starting' || event.status === 'running') {
        this.setState(task, this.hasPendingApproval(task) ? 'awaiting-approval' : 'running')
      } else if (
        event.status === 'awaiting-input' ||
        event.status === 'completed' ||
        event.status === 'error' ||
        event.status === 'interrupted'
      ) {
        this.setState(task, 'review')
        void this.startNextPending()
      }
    }
  }

  private onApprovalsChanged(): void {
    for (const task of this.list()) {
      if (task.state === 'done' || task.state === 'pending' || !task.sessionId) continue
      const pending = this.hasPendingApproval(task)
      if (pending && task.state === 'running') {
        this.setState(task, 'awaiting-approval')
      } else if (!pending && task.state === 'awaiting-approval') {
        this.setState(task, 'running')
      }
    }
  }

  private hasPendingApproval(task: KanbanTask): boolean {
    return this.broker.list().some((a) => a.sessionId === task.sessionId)
  }

  private setState(task: KanbanTask, state: KanbanState): void {
    if (task.state === state) return
    task.state = state
    this.persistAndEmit(task)
  }

  private persistAndEmit(task: KanbanTask): void {
    task.updatedAt = Date.now()
    try {
      this.store.upsertTask(task)
    } catch (error) {
      console.error('[nimbus:tasks] failed to persist task', error)
    }
    this.emit('changed', this.list())
  }

  private mustGet(taskId: string): KanbanTask {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Unknown task: ${taskId}`)
    return task
  }
}
