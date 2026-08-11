import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService, assertInsideRepo } from './GitService'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe('GitService（F-4 差分レビュー、実 git repo 統合）', () => {
  let dir: string
  const service = new GitService()

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nimbus-git-'))
    git(dir, 'init', '-b', 'main')
    git(dir, 'config', 'user.email', 'test@example.com')
    git(dir, 'config', 'user.name', 'test')
    writeFileSync(join(dir, 'a.txt'), 'hello\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-m', 'initial')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('status: リポジトリ・ブランチ・変更ファイルを返す', async () => {
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    writeFileSync(join(dir, 'new.txt'), 'brand new\n')
    const status = await service.status(dir)
    expect(status.isRepo).toBe(true)
    expect(status.branch).toBe('main')
    const paths = status.files.map((f) => f.path).sort()
    expect(paths).toEqual(['a.txt', 'new.txt'])
  })

  it('status: 非リポジトリでは isRepo=false（クラッシュしない）', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'nimbus-plain-'))
    try {
      const status = await service.status(plain)
      expect(status.isRepo).toBe(false)
      expect(status.files).toEqual([])
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })

  it('diffFile: HEAD と作業ツリーの両内容を返す（変更・新規・削除）', async () => {
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    const changed = await service.diffFile(dir, 'a.txt')
    expect(changed.before).toBe('hello\n')
    expect(changed.after).toBe('changed\n')

    writeFileSync(join(dir, 'new.txt'), 'brand new\n')
    const added = await service.diffFile(dir, 'new.txt')
    expect(added.before).toBe('')
    expect(added.after).toBe('brand new\n')

    rmSync(join(dir, 'a.txt'))
    const deleted = await service.diffFile(dir, 'a.txt')
    expect(deleted.before).toBe('hello\n')
    expect(deleted.after).toBe('')
  })

  it('チェックポイント: 作成 → 履歴に nimbus-checkpoint として載る → 復元で戻る', async () => {
    writeFileSync(join(dir, 'a.txt'), 'v2\n')
    const cp = await service.createCheckpoint(dir, 'before refactor')
    expect(cp.hash).toBeTruthy()

    const history = await service.listHistory(dir)
    expect(history[0]).toMatchObject({ label: 'before refactor', isCheckpoint: true })

    // さらに変更してから復元
    writeFileSync(join(dir, 'a.txt'), 'v3-broken\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-m', 'bad change')
    await service.restoreCheckpoint(dir, cp.hash)
    const diff = await service.diffFile(dir, 'a.txt')
    expect(diff.after).toBe('v2\n')
  })

  it('変更なしのチェックポイント作成はエラー（空コミットを作らない）', async () => {
    await expect(service.createCheckpoint(dir, 'nothing')).rejects.toThrow('変更がない')
  })

  it('revertFile: 追跡ファイルを HEAD の内容へ戻す', async () => {
    writeFileSync(join(dir, 'a.txt'), 'broken\n')
    await service.revertFile(dir, 'a.txt')
    const diff = await service.diffFile(dir, 'a.txt')
    expect(diff.after).toBe('hello\n')
  })

  it('パス検証: 絶対パス・リポジトリ外への脱出を拒否する', () => {
    expect(() => assertInsideRepo(dir, '/etc/passwd')).toThrow('must be relative')
    expect(() => assertInsideRepo(dir, '../outside.txt')).toThrow('escapes')
    expect(() => assertInsideRepo(dir, 'sub/../../outside.txt')).toThrow('escapes')
    expect(assertInsideRepo(dir, 'sub/file.txt')).toContain(dir)
  })

  it('restoreCheckpoint: 不正なハッシュを拒否する', async () => {
    await expect(service.restoreCheckpoint(dir, 'main; rm -rf /')).rejects.toThrow('Invalid')
  })

  it('SCM: stage → status 反映 → commit、unstage で戻る', async () => {
    writeFileSync(join(dir, 'a.txt'), 'staged change\n')
    writeFileSync(join(dir, 'b.txt'), 'untracked\n')
    await service.stage(dir, ['a.txt'])
    let status = await service.status(dir)
    expect(status.files.find((f) => f.path === 'a.txt')?.index).toBe('M')
    expect(status.files.find((f) => f.path === 'b.txt')?.workingDir).toBe('?')

    await service.unstage(dir, ['a.txt'])
    status = await service.status(dir)
    expect(status.files.find((f) => f.path === 'a.txt')?.index).toBe('')

    await service.stageAll(dir)
    const { hash } = await service.commit(dir, 'feat: SCM テストコミット')
    expect(hash).toBeTruthy()
    status = await service.status(dir)
    expect(status.files).toHaveLength(0)
  })

  it('SCM: ステージなしの commit はエラー', async () => {
    await expect(service.commit(dir, 'empty')).rejects.toThrow('ステージ済みの変更がありません')
  })

  it('collectDiff: staged / unstaged / untracked を分離して返す', async () => {
    writeFileSync(join(dir, 'a.txt'), 'staged\n')
    await service.stage(dir, ['a.txt'])
    writeFileSync(join(dir, 'a.txt'), 'staged then more\n')
    writeFileSync(join(dir, 'c.txt'), 'untracked\n')
    const diff = await service.collectDiff(dir)
    expect(diff.stagedDiff).toContain('staged')
    expect(diff.unstagedDiff).toContain('more')
    expect(diff.untracked).toEqual(['c.txt'])
  })

  it('SCM: stage のパス検証（脱出拒否）', async () => {
    await expect(service.stage(dir, ['../evil.txt'])).rejects.toThrow('escapes')
  })
})
