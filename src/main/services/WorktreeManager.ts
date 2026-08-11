import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import { randomBytes } from 'crypto'
import { simpleGit } from 'simple-git'

export interface WorktreeInfo {
  path: string
  branch: string
}

/** タスク名 → ブランチ/ディレクトリ安全な slug */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-龯]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || 'task'
}

/**
 * F-5: git worktree の生成／破棄／一覧。
 * worktree の実体は ~/.nimbus/worktrees/<repoName>/<slug>-<suffix> に置き、
 * ユーザーのリポジトリを汚さない。ブランチは nimbus/<slug>-<suffix>。
 */
export class WorktreeManager {
  constructor(private readonly baseDir: string = join(homedir(), '.nimbus', 'worktrees')) {}

  async create(repoCwd: string, title: string): Promise<WorktreeInfo> {
    const git = simpleGit(repoCwd)
    if (!(await git.checkIsRepo())) {
      throw new Error('ワークスペースが Git リポジトリではありません（worktree を作成できません）')
    }
    const suffix = randomBytes(3).toString('hex')
    const slug = `${slugify(title)}-${suffix}`
    const branch = `nimbus/${slug}`
    const dir = join(this.baseDir, basename(repoCwd), slug)
    mkdirSync(join(this.baseDir, basename(repoCwd)), { recursive: true })
    await git.raw(['worktree', 'add', '-b', branch, dir])
    return { path: dir, branch }
  }

  /**
   * worktree を破棄する（ブランチは残す — マージはユーザーの通常フローで行う）。
   * §critical 修正: 削除前に未コミットの成果をタスクブランチへ WIP コミットして保存する
   * （`--force` は未コミット変更を無警告で消すため、「ブランチは残る」の約束を実体化させる）。
   * @returns 保存のために WIP コミットを作成した場合そのハッシュ
   */
  async remove(repoCwd: string, worktreePath: string): Promise<{ wipCommit?: string }> {
    if (!this.isManaged(worktreePath)) {
      throw new Error('Nimbus 管理外のディレクトリは破棄できません')
    }
    let wipCommit: string | undefined
    const wt = simpleGit(worktreePath)
    try {
      const status = await wt.status()
      if (!status.isClean()) {
        await wt.add(['-A'])
        const result = await wt.commit('nimbus: WIP (タスク完了時の自動保存)')
        wipCommit = result.commit || undefined
      }
    } catch (error) {
      // worktree が既に壊れている/存在しない場合は保存をスキップして破棄へ進む
      console.warn('[nimbus:worktree] WIP save skipped', error)
    }
    const git = simpleGit(repoCwd)
    await git.raw(['worktree', 'remove', '--force', worktreePath])
    return { wipCommit }
  }

  async list(repoCwd: string): Promise<WorktreeInfo[]> {
    const git = simpleGit(repoCwd)
    if (!(await git.checkIsRepo())) return []
    const raw = await git.raw(['worktree', 'list', '--porcelain'])
    const entries: WorktreeInfo[] = []
    let current: Partial<WorktreeInfo> = {}
    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        current = { path: line.slice('worktree '.length) }
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice('branch '.length).replace('refs/heads/', '')
      } else if (line.trim() === '' && current.path) {
        entries.push({ path: current.path, branch: current.branch ?? '' })
        current = {}
      }
    }
    if (current.path) entries.push({ path: current.path, branch: current.branch ?? '' })
    return entries
  }

  /** このマネージャが管理する worktree か（破棄可否の判定に使用） */
  isManaged(worktreePath: string): boolean {
    // 末尾セパレータ付きで比較し、prefix-sibling（例 baseDir + '-evil'）の誤判定を防ぐ
    const base = this.baseDir.endsWith('/') ? this.baseDir : this.baseDir + '/'
    return worktreePath === this.baseDir || worktreePath.startsWith(base)
  }
}
