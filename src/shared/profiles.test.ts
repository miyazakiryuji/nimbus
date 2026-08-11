import { describe, expect, it } from 'vitest'
import { billingModeLabel } from './profiles'

describe('billingModeLabel（F-7-3 課金モード表示 — 誤認防止が最重要）', () => {
  it('oauth → サブスク利用', () => {
    expect(billingModeLabel('oauth')).toBe('サブスク利用（利用上限を消費）')
  })

  it("実測値 'none'（API キー不使用＝OAuth ログイン）→ サブスク利用", () => {
    expect(billingModeLabel('none')).toBe('サブスク利用（利用上限を消費）')
  })

  it('API キー系（user/project/org/temporary）→ 従量課金表示', () => {
    for (const source of ['user', 'project', 'org', 'temporary']) {
      expect(billingModeLabel(source)).toBe('API キー利用（従量課金）')
    }
  })

  it('未確認（undefined）→ 接続未確認', () => {
    expect(billingModeLabel(undefined)).toBe('接続未確認')
  })

  it('クラウドプロバイダ方式は apiKeySource に関わらずプロバイダ課金表示', () => {
    expect(billingModeLabel('none', 'bedrock')).toContain('AWS Bedrock')
    expect(billingModeLabel('user', 'vertex')).toContain('Google Cloud')
    expect(billingModeLabel(undefined, 'foundry')).toContain('Microsoft Foundry')
  })

  it('claude-cli / api-key 方式ではプロバイダ表示にならない', () => {
    expect(billingModeLabel('none', 'claude-cli')).toBe('サブスク利用（利用上限を消費）')
    expect(billingModeLabel('user', 'api-key')).toBe('API キー利用（従量課金）')
  })
})
