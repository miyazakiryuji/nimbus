import { describe, expect, it } from 'vitest'
import { createSanitizer } from './sanitizer'

const s = createSanitizer({})

describe('sanitizer: 既知フォーマットのマスク', () => {
  it('Anthropic API キー（sk-ant-）をマスクする', () => {
    expect(s.sanitizeString('key=sk-ant-api03-abcDEF123456789xyz')).toBe(
      'key=[REDACTED:anthropic-key]'
    )
  })

  it('汎用シークレットキー（sk- 20文字以上）をマスクする', () => {
    expect(s.sanitizeString('sk-abcdefghijklmnopqrstuvwx')).toBe('[REDACTED:secret-key]')
  })

  it('短い sk- 接頭辞（例: sk-hynix のような普通の語）はマスクしない', () => {
    expect(s.sanitizeString('sk-hynix memory')).toBe('sk-hynix memory')
  })

  it('AWS アクセスキー ID をマスクする', () => {
    expect(s.sanitizeString('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED:aws-access-key]')
  })

  it('GitHub トークン（ghp_ 等）をマスクする', () => {
    expect(s.sanitizeString('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456')).toBe('[REDACTED:github-token]')
  })

  it('Slack トークン（xoxb- 等）をマスクする', () => {
    expect(s.sanitizeString('xoxb-1234567890-abcdef')).toBe('[REDACTED:slack-token]')
  })

  it('Bearer トークンをマスクする', () => {
    expect(s.sanitizeString('Authorization: Bearer abc.DEF-123_456~789xyz')).toBe(
      'Authorization: [REDACTED:bearer-token]'
    )
  })

  it('JWT をマスクする', () => {
    expect(
      s.sanitizeString('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4')
    ).toBe('[REDACTED:jwt]')
  })

  it('普通の文章・コード断片は変更しない', () => {
    const text = 'const skill = "skills/foo"; // Bearer of good news\n通常の日本語テキスト'
    expect(s.sanitizeString(text)).toBe(text)
  })
})

describe('sanitizer: 環境変数値のマスク', () => {
  const envSan = createSanitizer({
    ANTHROPIC_API_KEY: 'my-secret-value-123',
    DB_PASSWORD: 'hunter2hunter2',
    SHORT_TOKEN: 'abc' // 8 文字未満 → 対象外
  })

  it('機密名の環境変数の値を literal マスクする', () => {
    expect(envSan.sanitizeString('connecting with my-secret-value-123 now')).toBe(
      'connecting with [REDACTED:env:ANTHROPIC_API_KEY] now'
    )
    expect(envSan.sanitizeString('pass=hunter2hunter2')).toBe('pass=[REDACTED:env:DB_PASSWORD]')
  })

  it('短すぎる値・機密名でない変数はマスクしない', () => {
    expect(envSan.sanitizeString('abc 12345')).toBe('abc 12345')
  })
})

describe('sanitizer: ホームパスのマスク（診断ログの OS ユーザー名漏洩防止）', () => {
  const homeSan = createSanitizer({}, '/Users/someone')

  it('ホームディレクトリのパスを ~ に置換する', () => {
    expect(
      homeSan.sanitizeString('fatal: /Users/someone/.nimbus/worktrees/x is not a working tree')
    ).toBe('fatal: ~/.nimbus/worktrees/x is not a working tree')
  })

  it('ホーム未指定なら何もしない', () => {
    expect(createSanitizer({}).sanitizeString('/Users/someone/x')).toBe('/Users/someone/x')
  })
})

describe('sanitizer: 値の深いサニタイズ', () => {
  it('ネストしたオブジェクト内の秘密もマスクされ、構造は保たれる', () => {
    const input = {
      kind: 'tool-use',
      input: {
        command: 'export API_KEY=sk-ant-deadbeef12345678',
        nested: [1, 'AKIAIOSFODNN7EXAMPLE']
      }
    }
    const out = s.sanitizeValue(input)
    expect(out.kind).toBe('tool-use')
    expect(out.input.command).toBe('export API_KEY=[REDACTED:anthropic-key]')
    expect(out.input.nested).toEqual([1, '[REDACTED:aws-access-key]'])
  })

  it('冪等（二重適用しても壊れない）', () => {
    const once = s.sanitizeString('sk-ant-api03-abcDEF123456789xyz')
    expect(s.sanitizeString(once)).toBe(once)
  })
})
