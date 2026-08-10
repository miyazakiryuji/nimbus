import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Theme } from '@shared/theme'
import { ThemeService } from './ThemeService'

const dark: Theme = { name: 'Nimbus Dark', type: 'dark', colors: { 'editor.background': '#000' } }
const light: Theme = {
  name: 'Nimbus Light',
  type: 'light',
  colors: { 'editor.background': '#fff' }
}

const BUILTIN = { 'nimbus-dark': dark, 'nimbus-light': light }

describe('ThemeService', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nimbus-themes-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('内蔵テーマ＋ユーザーテーマを一覧し、不正なテーマはスキップする', () => {
    writeFileSync(join(dir, 'mytheme.json'), JSON.stringify({ ...dark, name: 'My Theme' }))
    writeFileSync(join(dir, 'broken.json'), '{ not json')
    writeFileSync(join(dir, 'invalid.json'), JSON.stringify({ name: 'x' }))
    writeFileSync(join(dir, 'note.txt'), 'ignore me')
    const service = new ThemeService(BUILTIN, dir)
    const ids = service.list().map((t) => t.id)
    expect(ids).toContain('nimbus-dark')
    expect(ids).toContain('nimbus-light')
    expect(ids).toContain('user:mytheme')
    expect(ids).toHaveLength(3)
    expect(service.list().find((t) => t.id === 'user:mytheme')?.source).toBe('user')
  })

  it("'system' は OS のダークモード状態で Dark / Light に解決される", () => {
    const service = new ThemeService(BUILTIN, dir)
    expect(service.resolve('system', true).id).toBe('nimbus-dark')
    expect(service.resolve('system', false).id).toBe('nimbus-light')
  })

  it('未知のテーマ id は警告してフォールバックする（§5 の方針）', () => {
    const service = new ThemeService(BUILTIN, dir)
    expect(service.resolve('user:deleted', true).id).toBe('nimbus-dark')
  })

  it('rescan で後から置いたユーザーテーマを認識する（ホットリロードの実体）', () => {
    const service = new ThemeService(BUILTIN, dir)
    expect(service.list()).toHaveLength(2)
    writeFileSync(join(dir, 'late.json'), JSON.stringify({ ...light, name: 'Late' }))
    service.rescan()
    expect(service.list().map((t) => t.id)).toContain('user:late')
    // ユーザーテーマを直接選択できる
    expect(service.resolve('user:late', true).theme.name).toBe('Late')
  })

  it('ユーザーテーマディレクトリ不在でも動作する', () => {
    const service = new ThemeService(BUILTIN, join(dir, 'does-not-exist'))
    expect(service.list()).toHaveLength(2)
  })
})
