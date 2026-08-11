import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Profile } from '@shared/profiles'
import { ConfigService } from './ConfigService'

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: '44444444-4444-4444-8444-444444444444',
  name: 'work',
  method: 'api-key',
  env: {},
  binary: 'bundled',
  ...over
})

describe('ConfigService', () => {
  let dir: string
  let config: ConfigService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nimbus-config-'))
    config = new ConfigService(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('ファイル不在時は既定値を返す', () => {
    expect(config.loadProfiles()).toEqual({ version: 1, activeProfileId: null, profiles: [] })
  })

  it('upsert → load の roundtrip。最初のプロファイルが自動的にアクティブになる', () => {
    config.upsertProfile(profile())
    const file = config.loadProfiles()
    expect(file.profiles).toHaveLength(1)
    expect(file.activeProfileId).toBe(profile().id)
    expect(config.getActiveProfile()?.name).toBe('work')
  })

  it('§5/§6: 機密らしい名前の env キーは保存を拒否する', () => {
    expect(() => config.upsertProfile(profile({ env: { ANTHROPIC_API_KEY: 'x' } }))).toThrow(
      'must not contain secrets'
    )
    expect(() => config.upsertProfile(profile({ env: { MY_TOKEN: 'x' } }))).toThrow(
      'must not contain secrets'
    )
    // 非機密名は許可
    config.upsertProfile(profile({ env: { CLOUD_ML_REGION: 'global' } }))
    expect(config.loadProfiles().profiles[0].env['CLOUD_ML_REGION']).toBe('global')
  })

  it('profiles.json に平文の機密が書かれない（ファイル内容の直接検証）', () => {
    config.upsertProfile(profile({ env: { CLOUD_ML_REGION: 'global' } }))
    const raw = readFileSync(join(dir, 'profiles.json'), 'utf8')
    expect(raw).not.toContain('sk-')
    expect(raw).toContain('CLOUD_ML_REGION')
  })

  it('削除するとアクティブが次のプロファイルへ移る', () => {
    const p1 = profile()
    const p2 = profile({ id: '55555555-5555-4555-8555-555555555555', name: 'personal' })
    config.upsertProfile(p1)
    config.upsertProfile(p2)
    config.deleteProfile(p1.id)
    const file = config.loadProfiles()
    expect(file.profiles).toHaveLength(1)
    expect(file.activeProfileId).toBe(p2.id)
  })

  it('壊れた JSON は警告して既定値へフォールバック（§5）', () => {
    writeFileSync(join(dir, 'profiles.json'), '{ broken json')
    expect(config.loadProfiles()).toEqual({ version: 1, activeProfileId: null, profiles: [] })
  })

  it('存在しないプロファイルをアクティブ指定するとエラー', () => {
    expect(() => config.setActiveProfile('66666666-6666-4666-8666-666666666666')).toThrow(
      'Unknown profile'
    )
  })

  it('settings.json: 不在・破損時は既定値、保存 → 読込の roundtrip（§5）', () => {
    const defaults = { theme: 'system', font: {}, maxConcurrentSessions: 3 }
    expect(config.loadSettings()).toEqual(defaults)
    config.saveSettings({ theme: 'nimbus-dark', font: { fontSize: 16 }, maxConcurrentSessions: 5 })
    expect(config.loadSettings()).toEqual({
      theme: 'nimbus-dark',
      font: { fontSize: 16 },
      maxConcurrentSessions: 5
    })
    writeFileSync(join(dir, 'settings.json'), '{ broken')
    expect(config.loadSettings()).toEqual(defaults)
    // 既存ファイルに新フィールドが無くても既定値が補完される（後方互換）
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'system', font: {} }))
    expect(config.loadSettings().maxConcurrentSessions).toBe(3)
  })
})
