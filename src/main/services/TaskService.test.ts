import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { KanbanTask } from '@shared/tasks'
import { TaskService } from './TaskService'
import type { Store } from '../db/Store'
import type { WorktreeManager } from './WorktreeManager'
import type { SessionManager } from './SessionManager'
import type { PermissionBroker } from './PermissionBroker'

/** 依存をすべてフェイクにした TaskService の状態遷移テスト */
function setup(options?: { maxConcurrent?: number; persisted?: KanbanTask[] }): {
  service: TaskService
  sessions: EventEmitter & {
    createSession: ReturnType<typeof vi.fn>
    isActive: (id: string) => boolean
    close: ReturnType<typeof vi.fn>
  }
  broker: EventEmitter & { list: ReturnType<typeof vi.fn> }
  worktrees: { create: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
  store: { upsertTask: ReturnType<typeof vi.fn>; listTasks: () => KanbanTask[] }
} {
  let sessionCounter = 0
  const sessions = Object.assign(new EventEmitter(), {
    createSession: vi.fn(async () => `session-${++sessionCounter}`),
    isActive: () => true,
    close: vi.fn()
  })
  const broker = Object.assign(new EventEmitter(), {
    list: vi.fn(() => [] as Array<{ sessionId: string }>)
  })
  const worktrees = {
    create: vi.fn(async (_repo: string, title: string) => ({
      path: `/wt/${title}`,
      branch: `nimbus/${title}`
    })),
    remove: vi.fn(async () => undefined)
  }
  const store = {
    upsertTask: vi.fn(),
    listTasks: () => options?.persisted ?? []
  }
  const service = new TaskService(
    store as unknown as Store,
    worktrees as unknown as WorktreeManager,
    sessions as unknown as SessionManager,
    broker as unknown as PermissionBroker,
    () => options?.maxConcurrent ?? 3
  )
  return { service, sessions, broker, worktrees, store }
}

describe('TaskService（F-5 カンバン状態遷移）', () => {
  it('作成 → autoStart で worktree cwd のセッションが開始され running になる', async () => {
    const { service, sessions } = setup()
    const task = await service.createTask({
      title: 'feat-a',
      prompt: 'implement A',
      repoCwd: '/repo',
      autoStart: true
    })
    expect(sessions.createSession).toHaveBeenCalledWith({
      cwd: '/wt/feat-a',
      firstMessage: 'implement A'
    })
    expect(service.list().find((t) => t.taskId === task.taskId)?.state).toBe('running')
  })

  it('同時実行上限: 超過分は pending に留まり、レビュー待ちで空くと自動開始', async () => {
    const { service, sessions } = setup({ maxConcurrent: 1 })
    const a = await service.createTask({
      title: 'a',
      prompt: 'p',
      repoCwd: '/repo',
      autoStart: true
    })
    const b = await service.createTask({
      title: 'b',
      prompt: 'p',
      repoCwd: '/repo',
      autoStart: true
    })
    expect(service.list().find((t) => t.taskId === a.taskId)?.state).toBe('running')
    expect(service.list().find((t) => t.taskId === b.taskId)?.state).toBe('pending')

    // a のターン完了 → review へ → 空きが出て b が自動開始
    sessions.emit('event', {
      kind: 'status',
      sessionId: 'session-1',
      timestamp: Date.now(),
      status: 'awaiting-input'
    })
    await vi.waitFor(() => {
      expect(service.list().find((t) => t.taskId === a.taskId)?.state).toBe('review')
      expect(service.list().find((t) => t.taskId === b.taskId)?.state).toBe('running')
    })
  })

  it('承認保留で awaiting-approval、解消で running に戻る', async () => {
    const { service, sessions, broker } = setup()
    const task = await service.createTask({
      title: 'c',
      prompt: 'p',
      repoCwd: '/repo',
      autoStart: true
    })
    const sessionId = service.list().find((t) => t.taskId === task.taskId)?.sessionId
    broker.list.mockReturnValue([{ sessionId }])
    broker.emit('changed')
    expect(service.list().find((t) => t.taskId === task.taskId)?.state).toBe('awaiting-approval')

    broker.list.mockReturnValue([])
    broker.emit('changed')
    expect(service.list().find((t) => t.taskId === task.taskId)?.state).toBe('running')
    void sessions
  })

  it('完了: セッション close＋worktree 破棄＋done、永続化される', async () => {
    const { service, sessions, worktrees, store } = setup()
    const task = await service.createTask({
      title: 'd',
      prompt: 'p',
      repoCwd: '/repo',
      autoStart: true
    })
    await service.completeTask(task.taskId)
    expect(sessions.close).toHaveBeenCalled()
    expect(worktrees.remove).toHaveBeenCalledWith('/repo', '/wt/d')
    expect(service.list().find((t) => t.taskId === task.taskId)?.state).toBe('done')
    expect(store.upsertTask).toHaveBeenCalled()
  })

  it('再起動復元: running/awaiting-approval は review に倒れる・done/pending は維持', () => {
    const base = {
      title: 't',
      repoCwd: '/repo',
      worktreePath: '/wt/t',
      branch: 'nimbus/t',
      prompt: 'p',
      createdAt: 1,
      updatedAt: 1
    }
    const { service } = setup({
      persisted: [
        { ...base, taskId: '11111111-1111-4111-8111-111111111111', state: 'running' },
        { ...base, taskId: '22222222-2222-4222-8222-222222222222', state: 'awaiting-approval' },
        { ...base, taskId: '33333333-3333-4333-8333-333333333333', state: 'done' },
        { ...base, taskId: '44444444-4444-4444-8444-444444444444', state: 'pending' }
      ]
    })
    const states = service.list().map((t) => t.state)
    expect(states).toEqual(['review', 'review', 'done', 'pending'])
  })

  it('done タスクはセッションイベントの影響を受けない', async () => {
    const { service, sessions } = setup()
    const task = await service.createTask({
      title: 'e',
      prompt: 'p',
      repoCwd: '/repo',
      autoStart: true
    })
    const sessionId = service.list().find((t) => t.taskId === task.taskId)?.sessionId
    await service.completeTask(task.taskId)
    sessions.emit('event', {
      kind: 'status',
      sessionId,
      timestamp: Date.now(),
      status: 'running'
    })
    expect(service.list().find((t) => t.taskId === task.taskId)?.state).toBe('done')
  })
})
