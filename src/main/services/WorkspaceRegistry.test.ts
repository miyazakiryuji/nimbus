import { describe, expect, it } from 'vitest'
import { WorkspaceRegistry } from './WorkspaceRegistry'

describe('WorkspaceRegistry（§6 多層防御: renderer 由来ルートの許可リスト）', () => {
  it('未登録のパスは拒否する', () => {
    const registry = new WorkspaceRegistry()
    expect(registry.isAllowed('/repo')).toBe(false)
    expect(() => registry.assertAllowed('/repo')).toThrow('登録されていません')
  })

  it('登録したルートとそのサブディレクトリを許可する', () => {
    const registry = new WorkspaceRegistry()
    registry.register('/repo')
    expect(registry.isAllowed('/repo')).toBe(true)
    expect(registry.isAllowed('/repo/src/main')).toBe(true)
    expect(() => registry.assertAllowed('/repo/src')).not.toThrow()
  })

  it('prefix が同じだけの兄弟ディレクトリは拒否する', () => {
    const registry = new WorkspaceRegistry()
    registry.register('/repo')
    expect(registry.isAllowed('/repo-evil')).toBe(false)
    expect(registry.isAllowed('/repository')).toBe(false)
  })

  it('親ディレクトリは許可しない（登録は下方向にのみ効く）', () => {
    const registry = new WorkspaceRegistry()
    registry.register('/repo/sub')
    expect(registry.isAllowed('/repo')).toBe(false)
  })

  it('相対パス・末尾スラッシュを正規化して判定する', () => {
    const registry = new WorkspaceRegistry()
    registry.register('/repo/')
    expect(registry.isAllowed('/repo/./src')).toBe(true)
    expect(registry.isAllowed('/repo/src/..')).toBe(true)
    expect(registry.isAllowed('/repo/../etc')).toBe(false)
  })

  it('空文字は登録も許可もしない', () => {
    const registry = new WorkspaceRegistry()
    registry.register('')
    expect(registry.list()).toEqual([])
    expect(registry.isAllowed('')).toBe(false)
  })

  it('複数ルートを保持する', () => {
    const registry = new WorkspaceRegistry()
    registry.register('/a')
    registry.register('/b')
    registry.register('/a')
    expect(registry.list().sort()).toEqual(['/a', '/b'])
    expect(registry.isAllowed('/b/x')).toBe(true)
  })
})
