import { describe, expect, it } from 'vitest'
import { createSanitizer } from './sanitizer'
import { LogBuffer } from './LogBuffer'

const sanitize = createSanitizer({}).sanitizeString

describe('LogBuffer（診断ビュー・§6-2/6-3）', () => {
  it('追記時にサニタイザを通す（issue に貼っても安全）', () => {
    const buffer = new LogBuffer(sanitize)
    buffer.append('error', ['auth failed with key sk-ant-api03-abcDEF123456789xyz'])
    expect(buffer.list()[0].message).toBe('auth failed with key [REDACTED:anthropic-key]')
  })

  it('Error オブジェクトはスタック付きで整形される', () => {
    const buffer = new LogBuffer(sanitize)
    buffer.append('error', [new Error('boom')])
    expect(buffer.list()[0].message).toContain('Error: boom')
  })

  it('容量を超えると古い順に破棄される（リングバッファ）', () => {
    const buffer = new LogBuffer(sanitize, 3)
    for (let i = 0; i < 5; i++) buffer.append('log', [`msg-${i}`])
    expect(buffer.list().map((e) => e.message)).toEqual(['msg-2', 'msg-3', 'msg-4'])
  })

  it('clear で空になる', () => {
    const buffer = new LogBuffer(sanitize)
    buffer.append('log', ['x'])
    buffer.clear()
    expect(buffer.list()).toEqual([])
  })

  it('循環参照など JSON 化できない値でも落ちない', () => {
    const buffer = new LogBuffer(sanitize)
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    buffer.append('warn', [circular])
    expect(buffer.list()).toHaveLength(1)
  })
})
