import { describe, expect, it } from 'vitest'
import type { NimbusEvent } from '@shared/events'
import { SessionManager } from './SessionManager'

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

    const sessionId = manager.createSession({
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
})
