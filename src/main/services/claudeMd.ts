import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'

export interface ClaudeMdEntry {
  path: string
  scope: 'user' | 'project' | 'parent'
}

/**
 * F-2: 適用されている CLAUDE.md の階層（ユーザー / 親ディレクトリ / プロジェクト）を列挙する。
 * 表示順: ユーザー → 親（ルート側から）→ プロジェクト（cwd）。
 */
export function findClaudeMdChain(
  cwd: string,
  home: string = homedir(),
  exists: (p: string) => boolean = existsSync
): ClaudeMdEntry[] {
  const entries: ClaudeMdEntry[] = []
  const userPath = join(home, '.claude', 'CLAUDE.md')
  if (exists(userPath)) {
    entries.push({ path: userPath, scope: 'user' })
  }
  const chain: string[] = []
  let dir = cwd
  for (;;) {
    chain.unshift(dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  for (const d of chain) {
    const p = join(d, 'CLAUDE.md')
    if (p === userPath) continue
    if (exists(p)) {
      entries.push({ path: p, scope: d === cwd ? 'project' : 'parent' })
    }
  }
  return entries
}
