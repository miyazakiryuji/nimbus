import { describe, expect, it } from 'vitest'
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { PermissionBroker } from './PermissionBroker'

const SESSION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function callTool(
  broker: PermissionBroker,
  sessionId: string,
  cwd: string,
  toolName: string,
  input: Record<string, unknown> = {}
): { promise: Promise<PermissionResult>; controller: AbortController } {
  const controller = new AbortController()
  const canUseTool = broker.createCanUseTool(sessionId, cwd)
  const promise = canUseTool(toolName, input, {
    signal: controller.signal,
    toolUseID: `tu_${Math.random().toString(36).slice(2)}`,
    requestId: `req_${Math.random().toString(36).slice(2)}`
  }) as Promise<PermissionResult>
  return { promise, controller }
}

describe('PermissionBroker（F-3 承認インボックス）', () => {
  it('ツール実行を保留し、承認で allow（元の入力を保持）が返る', async () => {
    const broker = new PermissionBroker()
    const { promise } = callTool(broker, SESSION_A, '/w', 'Bash', { command: 'ls' })
    expect(broker.list()).toHaveLength(1)
    const [entry] = broker.list()
    expect(entry).toMatchObject({ sessionId: SESSION_A, toolName: 'Bash', cwd: '/w' })
    expect(entry.targetPath).toBe('ls')

    broker.approve([entry.id])
    const result = await promise
    expect(result).toEqual({ behavior: 'allow', updatedInput: { command: 'ls' } })
    expect(broker.list()).toHaveLength(0)
  })

  it('拒否で deny とメッセージが返る', async () => {
    const broker = new PermissionBroker()
    const { promise } = callTool(broker, SESSION_A, '/w', 'Write')
    broker.deny([broker.list()[0].id])
    const result = await promise
    expect(result.behavior).toBe('deny')
  })

  it('まとめて承認（複数 id）', async () => {
    const broker = new PermissionBroker()
    const c1 = callTool(broker, SESSION_A, '/w', 'Bash')
    const c2 = callTool(broker, SESSION_B, '/w', 'Write')
    expect(broker.approve(broker.list().map((e) => e.id))).toBe(2)
    expect((await c1.promise).behavior).toBe('allow')
    expect((await c2.promise).behavior).toBe('allow')
  })

  it('セッション単位の自動承認: 同セッションの同ツールのみ以後スキップ', async () => {
    const broker = new PermissionBroker()
    const first = callTool(broker, SESSION_A, '/w', 'Bash')
    broker.approve([broker.list()[0].id], 'session')
    await first.promise

    // 同セッション・同ツール → キューに積まれず即 allow
    const second = callTool(broker, SESSION_A, '/w', 'Bash')
    expect(broker.list()).toHaveLength(0)
    expect((await second.promise).behavior).toBe('allow')

    // 他セッションは対象外
    callTool(broker, SESSION_B, '/w', 'Bash')
    expect(broker.list()).toHaveLength(1)
    // 同セッションでも他ツールは対象外
    callTool(broker, SESSION_A, '/w', 'Write')
    expect(broker.list()).toHaveLength(2)
  })

  it('ワークスペース単位の自動承認: 同 cwd の別セッションにも効く', async () => {
    const broker = new PermissionBroker()
    const first = callTool(broker, SESSION_A, '/workspace', 'Bash')
    broker.approve([broker.list()[0].id], 'workspace')
    await first.promise

    const other = callTool(broker, SESSION_B, '/workspace', 'Bash')
    expect(broker.list()).toHaveLength(0)
    expect((await other.promise).behavior).toBe('allow')

    // 別 cwd は対象外
    callTool(broker, SESSION_B, '/elsewhere', 'Bash')
    expect(broker.list()).toHaveLength(1)
  })

  it('クエリ abort で承認待ちが取り下げられ deny が返る', async () => {
    const broker = new PermissionBroker()
    const { promise, controller } = callTool(broker, SESSION_A, '/w', 'Bash')
    expect(broker.list()).toHaveLength(1)
    controller.abort()
    const result = await promise
    expect(result.behavior).toBe('deny')
    expect(broker.list()).toHaveLength(0)
  })

  it('changed イベントがキュー変更のたびに発火する', () => {
    const broker = new PermissionBroker()
    const snapshots: number[] = []
    broker.on('changed', (list: unknown[]) => snapshots.push(list.length))
    callTool(broker, SESSION_A, '/w', 'Bash')
    broker.approve(broker.list().map((e) => e.id))
    expect(snapshots).toEqual([1, 0])
  })

  it('プレビューは切り詰められ、file_path が targetPath に抽出される', () => {
    const broker = new PermissionBroker()
    callTool(broker, SESSION_A, '/w', 'Write', {
      file_path: '/w/a.txt',
      content: 'x'.repeat(5000)
    })
    const [entry] = broker.list()
    expect(entry.targetPath).toBe('/w/a.txt')
    expect(entry.inputPreview.length).toBeLessThanOrEqual(800)
  })
})
