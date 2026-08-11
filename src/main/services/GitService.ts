import { readFile } from 'fs/promises'
import { isAbsolute, normalize, resolve } from 'path'
import { simpleGit } from 'simple-git'
import type { GitCheckpoint, GitFileChange, GitFileDiff, GitStatusResult } from '@shared/review'

const CHECKPOINT_PREFIX = 'nimbus-checkpoint: '
const MAX_DIFF_BYTES = 1_000_000

/** リポジトリ外へのパス脱出を防ぐ（IPC から渡る相対パスの検証） */
function assertInsideRepo(cwd: string, relPath: string): string {
  if (isAbsolute(relPath)) {
    throw new Error('Path must be relative to the repository root')
  }
  const full = resolve(cwd, normalize(relPath))
  if (!full.startsWith(resolve(cwd) + '/') && full !== resolve(cwd)) {
    throw new Error('Path escapes the repository root')
  }
  return full
}

/**
 * F-4: セッションが加えた変更の取得・チェックポイント・巻き戻し（simple-git）。
 */
export class GitService {
  async status(cwd: string): Promise<GitStatusResult> {
    const git = simpleGit(cwd)
    if (!(await git.checkIsRepo())) {
      return { isRepo: false, branch: undefined, files: [] }
    }
    const status = await git.status()
    const files: GitFileChange[] = status.files.map((f) => ({
      path: f.path,
      index: f.index.trim(),
      workingDir: f.working_dir.trim()
    }))
    return { isRepo: true, branch: status.current ?? undefined, files }
  }

  /** HEAD と作業ツリーの内容を返す（Monaco diff エディタ用） */
  async diffFile(cwd: string, relPath: string): Promise<GitFileDiff> {
    const full = assertInsideRepo(cwd, relPath)
    const git = simpleGit(cwd)
    let before = ''
    try {
      before = await git.show([`HEAD:${relPath}`])
    } catch {
      before = '' // 新規ファイル
    }
    let after = ''
    try {
      const buf = await readFile(full)
      after = buf.length > MAX_DIFF_BYTES ? '[file too large to display]' : buf.toString('utf8')
    } catch {
      after = '' // 削除されたファイル
    }
    return { path: relPath, before, after }
  }

  /** コミット単位のチェックポイント作成（全変更をステージして記録） */
  async createCheckpoint(cwd: string, label: string): Promise<GitCheckpoint> {
    const git = simpleGit(cwd)
    await git.add(['-A'])
    const result = await git.commit(`${CHECKPOINT_PREFIX}${label}`)
    const hash = result.commit
    if (!hash) {
      throw new Error('変更がないためチェックポイントを作成しませんでした')
    }
    return { hash, label, createdAt: Date.now() }
  }

  /** 直近のコミット履歴（チェックポイント含む） */
  async listHistory(cwd: string, limit = 30): Promise<GitCheckpoint[]> {
    const git = simpleGit(cwd)
    if (!(await git.checkIsRepo())) return []
    const log = await git.log({ maxCount: limit })
    return log.all.map((entry) => ({
      hash: entry.hash,
      label: entry.message.startsWith(CHECKPOINT_PREFIX)
        ? entry.message.slice(CHECKPOINT_PREFIX.length)
        : entry.message,
      isCheckpoint: entry.message.startsWith(CHECKPOINT_PREFIX),
      createdAt: new Date(entry.date).getTime()
    }))
  }

  /** ステージ（git add）。paths は検証済み相対パスのみ */
  async stage(cwd: string, paths: string[]): Promise<void> {
    for (const p of paths) assertInsideRepo(cwd, p)
    await simpleGit(cwd).add(paths)
  }

  async unstage(cwd: string, paths: string[]): Promise<void> {
    for (const p of paths) assertInsideRepo(cwd, p)
    await simpleGit(cwd).raw(['restore', '--staged', '--', ...paths])
  }

  async stageAll(cwd: string): Promise<void> {
    await simpleGit(cwd).add(['-A'])
  }

  async unstageAll(cwd: string): Promise<void> {
    await simpleGit(cwd).raw(['restore', '--staged', '.'])
  }

  /** ステージ済みの内容をコミットする */
  async commit(cwd: string, message: string): Promise<{ hash: string }> {
    const result = await simpleGit(cwd).commit(message)
    if (!result.commit) {
      throw new Error('ステージ済みの変更がありません')
    }
    return { hash: result.commit }
  }

  /** コミットメッセージ生成用の diff 収集（staged 優先） */
  async collectDiff(
    cwd: string
  ): Promise<{ stagedDiff: string; unstagedDiff: string; untracked: string[] }> {
    const git = simpleGit(cwd)
    const [stagedDiff, unstagedDiff, status] = await Promise.all([
      git.diff(['--cached']),
      git.diff(),
      git.status()
    ])
    return { stagedDiff, unstagedDiff, untracked: status.not_added }
  }

  /** ファイル単位の巻き戻し（HEAD の内容へ）。未追跡ファイルは対象外 */
  async revertFile(cwd: string, relPath: string): Promise<void> {
    assertInsideRepo(cwd, relPath)
    const git = simpleGit(cwd)
    await git.checkout(['HEAD', '--', relPath])
  }

  /** チェックポイントへの復元（reset --hard。破壊的なので UI 側で確認必須） */
  async restoreCheckpoint(cwd: string, hash: string): Promise<void> {
    if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
      throw new Error('Invalid commit hash')
    }
    const git = simpleGit(cwd)
    await git.reset(['--hard', hash])
  }
}

export { assertInsideRepo, CHECKPOINT_PREFIX }
