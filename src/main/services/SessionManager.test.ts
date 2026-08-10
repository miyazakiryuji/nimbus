import { describe, expect, it } from 'vitest'
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { NimbusEvent } from '@shared/events'
import { SessionManager } from './SessionManager'
import type { QueryFn } from './SessionManager'

/** 指定メッセージを流して終了（または失敗）するフェイク query() */
function fakeQuery(messages: unknown[], options?: { failWith?: Error }): QueryFn {
  return ((): Query => {
    async function* gen(): AsyncGenerator<SDKMessage, void> {
      for (const m of messages) {
        yield m as SDKMessage
      }
      if (options?.failWith) throw options.failWith
    }
    const g = gen()
    return Object.assign(g, {
      interrupt: async (): Promise<undefined> => undefined,
      setPermissionMode: async (): Promise<void> => undefined
    }) as unknown as Query
  }) as unknown as QueryFn
}

function collectEvents(manager: SessionManager): NimbusEvent[] {
  const events: NimbusEvent[] = []
  manager.on('event', (e: NimbusEvent) => events.push(e))
  return events
}

function waitForStatus(manager: SessionManager, sessionId: string, status: string): Promise<void> {
  // すでに到達済みならリスナー登録前の取りこぼしを防ぐため即 resolve
  if (manager.get(sessionId)?.status === status) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${status}`)), 2000)
    manager.on('event', (e: NimbusEvent) => {
      if (e.sessionId === sessionId && e.kind === 'status' && e.status === status) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

const resultMessage = (totalCostUsd: number, subtype = 'success'): unknown => ({
  type: 'result',
  subtype,
  is_error: subtype !== 'success',
  num_turns: 1,
  duration_ms: 10,
  total_cost_usd: totalCostUsd,
  usage: { input_tokens: 1, output_tokens: 1 },
  result: subtype === 'success' ? 'ok' : undefined,
  session_id: 's',
  uuid: 'u'
})

describe('SessionManager（レビュー修正の回帰テスト）', () => {
  it('クエリ失敗後の sendMessage は例外を投げ、user-text を記録しない', async () => {
    const manager = new SessionManager(fakeQuery([], { failWith: new Error('spawn failed') }))
    const events = collectEvents(manager)
    const id = manager.createSession({ firstMessage: 'hi', cwd: '/tmp' })
    await waitForStatus(manager, id, 'error')

    const userTextsBefore = events.filter((e) => e.kind === 'user-text').length
    expect(() => manager.sendMessage(id, 'again')).toThrow('not accepting input')
    expect(events.filter((e) => e.kind === 'user-text').length).toBe(userTextsBefore)
    // status は 'running' に固着しない
    expect(manager.get(id)?.status).toBe('error')
  })

  it('クエリ正常終了後は completed になり、キューが閉じられ送信不可', async () => {
    const manager = new SessionManager(fakeQuery([resultMessage(0.1)]))
    collectEvents(manager)
    const id = manager.createSession({ firstMessage: 'hi', cwd: '/tmp' })
    await waitForStatus(manager, id, 'completed')
    expect(() => manager.sendMessage(id, 'again')).toThrow('not accepting input')
  })

  it('累積コストは単調増加ガード（ゼロのクラッシュ result で後退しない）', async () => {
    const manager = new SessionManager(
      fakeQuery([resultMessage(0.5), resultMessage(0, 'error_during_execution')])
    )
    collectEvents(manager)
    const id = manager.createSession({ firstMessage: 'hi', cwd: '/tmp' })
    await waitForStatus(manager, id, 'completed')
    expect(manager.get(id)?.totalCostUsd).toBe(0.5)
  })

  it('エラー系 result でもコストが更新される（過少表示の防止）', async () => {
    const manager = new SessionManager(
      fakeQuery([resultMessage(0.5), resultMessage(0.8, 'error_during_execution')])
    )
    collectEvents(manager)
    const id = manager.createSession({ firstMessage: 'hi', cwd: '/tmp' })
    await waitForStatus(manager, id, 'completed')
    expect(manager.get(id)?.totalCostUsd).toBe(0.8)
  })

  it('多重セッション: 2 セッションのイベントが混線しない（§3 原則 5）', async () => {
    const manager = new SessionManager(fakeQuery([resultMessage(0.1)]))
    const events = collectEvents(manager)
    const id1 = manager.createSession({ firstMessage: 'one', cwd: '/tmp' })
    const id2 = manager.createSession({ firstMessage: 'two', cwd: '/tmp' })
    await waitForStatus(manager, id1, 'completed')
    await waitForStatus(manager, id2, 'completed')

    expect(manager.list()).toHaveLength(2)
    const ids = new Set(events.map((e) => e.sessionId))
    expect(ids).toEqual(new Set([id1, id2]))
    const textFor = (id: string): string[] =>
      events
        .filter((e): e is Extract<NimbusEvent, { kind: 'user-text' }> => e.kind === 'user-text')
        .filter((e) => e.sessionId === id)
        .map((e) => e.text)
    expect(textFor(id1)).toEqual(['one'])
    expect(textFor(id2)).toEqual(['two'])
  })

  it('interrupt は status を直接変更しない（turn-result が遷移を駆動する）', async () => {
    const manager = new SessionManager(fakeQuery([resultMessage(0.1)]))
    const events = collectEvents(manager)
    const id = manager.createSession({ firstMessage: 'hi', cwd: '/tmp' })
    await waitForStatus(manager, id, 'completed')
    await manager.interrupt(id)
    expect(events.some((e) => e.kind === 'status' && e.status === 'interrupted')).toBe(false)
  })

  it('closeAll で全セッションのキューが閉じる', async () => {
    const manager = new SessionManager(fakeQuery([resultMessage(0.1)]))
    collectEvents(manager)
    const id = manager.createSession({ firstMessage: 'hi', cwd: '/tmp' })
    await waitForStatus(manager, id, 'completed')
    manager.closeAll()
    expect(() => manager.sendMessage(id, 'x')).toThrow('not accepting input')
  })
})
