import { describe, expect, it } from 'vitest'
import type { NimbusEvent } from '@shared/events'
import { SessionManager } from './SessionManager'
import { PermissionBroker } from './PermissionBroker'

/**
 * 実 SDK を使う統合テスト（Claude Code の認証済み環境が必要・利用枠を消費する）。
 * 通常の `npm test` ではスキップされる。実行: RUN_SDK_SMOKE=1 npx vitest run
 */
const RUN = process.env['RUN_SDK_SMOKE'] === '1'

describe.runIf(RUN)('SDK roundtrip (real Claude Code)', () => {
  it('1 往復が完了し、init / user-text / assistant-text / turn-result が正規化されて流れる', async () => {
    const manager = new SessionManager()
    const events: NimbusEvent[] = []
    manager.on('event', (e: NimbusEvent) => events.push(e))

    const sessionId = await manager.createSession({
      cwd: process.cwd(),
      firstMessage: 'Reply with exactly: NIMBUS_OK'
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('roundtrip timeout')), 150_000)
      manager.on('event', (e: NimbusEvent) => {
        if (e.sessionId !== sessionId) return
        if (e.kind === 'turn-result') {
          clearTimeout(timer)
          resolve()
        }
        if (e.kind === 'session-error') {
          clearTimeout(timer)
          reject(new Error(e.message))
        }
      })
    })
    await manager.close(sessionId)

    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('session-init')
    expect(kinds).toContain('user-text')
    expect(kinds).toContain('assistant-text')
    expect(kinds).toContain('turn-result')

    const init = events.find((e) => e.kind === 'session-init')
    expect(init && 'claudeSessionId' in init && init.claudeSessionId.length > 0).toBe(true)

    const text = events
      .filter(
        (e): e is Extract<NimbusEvent, { kind: 'assistant-text' }> => e.kind === 'assistant-text'
      )
      .map((e) => e.text)
      .join('')
    expect(text).toContain('NIMBUS_OK')

    const result = events.find((e) => e.kind === 'turn-result')
    expect(result && 'isError' in result && result.isError).toBe(false)

    // 全イベントが sessionId を持つ（§3 設計原則 5）
    expect(events.every((e) => e.sessionId === sessionId)).toBe(true)
  }, 180_000)

  it('同時 2 セッションでイベントが混線しない（§3 原則 5 の実走検証）', async () => {
    const manager = new SessionManager()
    const events: NimbusEvent[] = []
    manager.on('event', (e: NimbusEvent) => events.push(e))

    const waitDone = (id: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout ' + id)), 150_000)
        manager.on('event', (e: NimbusEvent) => {
          if (e.sessionId === id && e.kind === 'turn-result') {
            clearTimeout(timer)
            resolve()
          }
        })
      })

    const idA = await manager.createSession({
      cwd: process.cwd(),
      firstMessage: 'Reply with exactly: TOKEN_ALPHA'
    })
    const idB = await manager.createSession({
      cwd: process.cwd(),
      firstMessage: 'Reply with exactly: TOKEN_BRAVO'
    })
    await Promise.all([waitDone(idA), waitDone(idB)])
    manager.closeAll()

    const textOf = (id: string): string =>
      events
        .filter(
          (e): e is Extract<NimbusEvent, { kind: 'assistant-text' }> => e.kind === 'assistant-text'
        )
        .filter((e) => e.sessionId === id)
        .map((e) => e.text)
        .join('')
    expect(textOf(idA)).toContain('TOKEN_ALPHA')
    expect(textOf(idA)).not.toContain('TOKEN_BRAVO')
    expect(textOf(idB)).toContain('TOKEN_BRAVO')
    expect(textOf(idB)).not.toContain('TOKEN_ALPHA')
  }, 200_000)

  it('resume で会話コンテキストが復元される（F-1 再開の実走検証）', async () => {
    const manager = new SessionManager()
    const events: NimbusEvent[] = []
    manager.on('event', (e: NimbusEvent) => events.push(e))

    const waitDone = (id: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout ' + id)), 150_000)
        manager.on('event', (e: NimbusEvent) => {
          if (e.sessionId === id && e.kind === 'turn-result') {
            clearTimeout(timer)
            resolve()
          }
        })
      })

    const id1 = await manager.createSession({
      cwd: process.cwd(),
      firstMessage: 'Remember this token: ZEPHYR42. Reply with exactly: SAVED'
    })
    await waitDone(id1)
    const claudeSessionId = events.find(
      (e): e is Extract<NimbusEvent, { kind: 'session-init' }> =>
        e.kind === 'session-init' && e.sessionId === id1
    )?.claudeSessionId
    expect(claudeSessionId).toBeTruthy()
    manager.close(id1)

    const id2 = await manager.createSession({
      cwd: process.cwd(),
      resumeClaudeSessionId: claudeSessionId,
      firstMessage: 'What token did I ask you to remember? Reply with the token only.'
    })
    await waitDone(id2)
    manager.closeAll()

    const resumedText = events
      .filter(
        (e): e is Extract<NimbusEvent, { kind: 'assistant-text' }> => e.kind === 'assistant-text'
      )
      .filter((e) => e.sessionId === id2)
      .map((e) => e.text)
      .join('')
    expect(resumedText).toContain('ZEPHYR42')
  }, 320_000)

  it('承認インボックス実走: ツール実行が保留され、承認後に実行される（F-3）', async () => {
    const broker = new PermissionBroker()
    const queuedTools: string[] = []
    broker.on('added', (summary: { id: string; toolName: string }) => {
      queuedTools.push(summary.toolName)
      // 人間の承認の代わりに、キュー到着を確認してから承認する
      setTimeout(() => broker.approve([summary.id]), 300)
    })

    const manager = new SessionManager(undefined, undefined, (sessionId, cwd) =>
      broker.createCanUseTool(sessionId, cwd)
    )
    const events: NimbusEvent[] = []
    manager.on('event', (e: NimbusEvent) => events.push(e))

    // 注: echo 等の読み取り安全コマンドは Claude Code 側の組み込み許可で
    // canUseTool に届かないことをプローブで確認済み。書き込み系コマンドを使う
    const sessionId = await manager.createSession({
      cwd: process.cwd(),
      firstMessage:
        'Use the Bash tool to run exactly this command: touch /tmp/nimbus-approval-e2e.txt — then reply with exactly: DONE'
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('approval roundtrip timeout')), 150_000)
      manager.on('event', (e: NimbusEvent) => {
        if (e.sessionId !== sessionId) return
        if (e.kind === 'turn-result') {
          clearTimeout(timer)
          resolve()
        }
        if (e.kind === 'session-error') {
          clearTimeout(timer)
          reject(new Error(e.message))
        }
      })
    })
    manager.closeAll()

    // ツールが承認キューを経由した
    expect(queuedTools).toContain('Bash')
    // 承認後にツールが実際に実行され、結果が正規化されて流れた
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('tool-use')
    expect(kinds).toContain('tool-result')
    const toolUse = events.find(
      (e): e is Extract<NimbusEvent, { kind: 'tool-use' }> => e.kind === 'tool-use'
    )
    expect(JSON.stringify(toolUse?.input)).toContain('nimbus-approval-e2e')
    const doneText = events
      .filter(
        (e): e is Extract<NimbusEvent, { kind: 'assistant-text' }> => e.kind === 'assistant-text'
      )
      .map((e) => e.text)
      .join('')
    expect(doneText).toContain('DONE')
    expect(broker.list()).toHaveLength(0)
  }, 200_000)
})
