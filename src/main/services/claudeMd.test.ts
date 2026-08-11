import { describe, expect, it } from 'vitest'
import { findClaudeMdChain } from './claudeMd'

describe('findClaudeMdChain（F-2 CLAUDE.md 階層）', () => {
  const exists = (paths: string[]) => (p: string) => paths.includes(p)

  it('ユーザー / 親 / プロジェクトの 3 階層を正しい順序と scope で返す', () => {
    const chain = findClaudeMdChain(
      '/work/company/product',
      '/Users/me',
      exists([
        '/Users/me/.claude/CLAUDE.md',
        '/work/company/CLAUDE.md',
        '/work/company/product/CLAUDE.md'
      ])
    )
    expect(chain).toEqual([
      { path: '/Users/me/.claude/CLAUDE.md', scope: 'user' },
      { path: '/work/company/CLAUDE.md', scope: 'parent' },
      { path: '/work/company/product/CLAUDE.md', scope: 'project' }
    ])
  })

  it('どこにも無ければ空配列', () => {
    expect(findClaudeMdChain('/tmp/x', '/Users/me', () => false)).toEqual([])
  })

  it('プロジェクト直下のみのケース', () => {
    const chain = findClaudeMdChain('/repo', '/Users/me', exists(['/repo/CLAUDE.md']))
    expect(chain).toEqual([{ path: '/repo/CLAUDE.md', scope: 'project' }])
  })

  it('親は ルート側 → cwd 側 の順で並ぶ', () => {
    const chain = findClaudeMdChain(
      '/a/b/c',
      '/Users/me',
      exists(['/a/CLAUDE.md', '/a/b/CLAUDE.md'])
    )
    expect(chain.map((e) => e.path)).toEqual(['/a/CLAUDE.md', '/a/b/CLAUDE.md'])
    expect(chain.every((e) => e.scope === 'parent')).toBe(true)
  })
})
