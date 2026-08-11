import { mkdtempSync, realpathSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorktreeManager, slugify } from './WorktreeManager'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe('WorktreeManager（F-5、実 git repo 統合）', () => {
  let repo: string
  let base: string
  let manager: WorktreeManager

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'nimbus-wt-repo-'))
    base = mkdtempSync(join(tmpdir(), 'nimbus-wt-base-'))
    manager = new WorktreeManager(base)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@example.com')
    git(repo, 'config', 'user.name', 'test')
    writeFileSync(join(repo, 'a.txt'), 'hello\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-m', 'initial')
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
    rmSync(base, { recursive: true, force: true })
  })

  it('create: 管理ディレクトリ配下に worktree と nimbus/ ブランチを作る', async () => {
    const wt = await manager.create(repo, 'ログイン機能の実装')
    expect(wt.path.startsWith(base)).toBe(true)
    expect(wt.branch.startsWith('nimbus/')).toBe(true)
    expect(existsSync(join(wt.path, 'a.txt'))).toBe(true)
    expect(manager.isManaged(wt.path)).toBe(true)

    // macOS では /var → /private/var の symlink 差異があるため realpath で比較
    const listed = await manager.list(repo)
    const real = realpathSync(wt.path)
    expect(listed.some((w) => realpathSync(w.path) === real && w.branch === wt.branch)).toBe(true)
  })

  it('remove: 未コミット成果をブランチへ WIP 保存してから破棄する（データ消失防止）', async () => {
    const wt = await manager.create(repo, 'task')
    writeFileSync(join(wt.path, 'wip.txt'), 'in progress\n')
    writeFileSync(join(wt.path, 'a.txt'), 'edited by claude\n')
    const result = await manager.remove(repo, wt.path)
    expect(existsSync(wt.path)).toBe(false)
    expect(result.wipCommit).toBeTruthy()
    // ブランチに成果がコミットされて残っている（--force で消えていない）
    expect(git(repo, 'branch', '--list', wt.branch).trim()).not.toBe('')
    expect(git(repo, 'show', `${wt.branch}:wip.txt`)).toContain('in progress')
    expect(git(repo, 'show', `${wt.branch}:a.txt`)).toContain('edited by claude')
  })

  it('remove: 変更が無ければ WIP コミットを作らない', async () => {
    const wt = await manager.create(repo, 'clean')
    const result = await manager.remove(repo, wt.path)
    expect(result.wipCommit).toBeUndefined()
  })

  it('isManaged: prefix-sibling ディレクトリを管理外と判定する', () => {
    expect(manager.isManaged(join(base, 'repo', 'x'))).toBe(true)
    expect(manager.isManaged(base + '-evil/x')).toBe(false)
  })

  it('remove: 管理外ディレクトリは拒否する', async () => {
    await expect(manager.remove(repo, '/tmp')).rejects.toThrow('管理外')
  })

  it('create: 非リポジトリではエラー', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'nimbus-plain-'))
    try {
      await expect(manager.create(plain, 'x')).rejects.toThrow('Git リポジトリではありません')
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })

  it('slugify: 日本語・記号を安全な slug にする', () => {
    expect(slugify('ログイン機能の実装!')).toBe('ログイン機能の実装')
    expect(slugify('Fix: bug #123')).toBe('fix-bug-123')
    expect(slugify('!!!')).toBe('task')
  })

  it('同名タスクでも suffix で衝突しない', async () => {
    const a = await manager.create(repo, 'same')
    const b = await manager.create(repo, 'same')
    expect(a.path).not.toBe(b.path)
    expect(a.branch).not.toBe(b.branch)
  })
})
