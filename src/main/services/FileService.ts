import { existsSync } from 'fs'
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'fs/promises'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'path'
import type { DirectoryListing, FileContent, FileEntry } from '@shared/files'

/** エディタで開ける最大バイト数（超過分は読み込まない） */
const MAX_FILE_BYTES = 2_000_000
/** 1 ディレクトリあたりの最大表示件数（node_modules 等の巨大ディレクトリ対策） */
const MAX_ENTRIES = 2_000
/** バイナリ判定に読むバイト数 */
const SNIFF_BYTES = 8_000
/** 常に隠すエントリ */
const ALWAYS_HIDDEN = new Set(['.git', '.DS_Store'])

/**
 * ルート外へ出ないことを字面で検証する（シンボリックリンクは別途 realpath で検証）。
 */
export function resolveInsideRoot(root: string, relPath: string): string {
  if (isAbsolute(relPath)) {
    throw new Error('Path must be relative to the workspace root')
  }
  const resolvedRoot = resolve(root)
  const full = resolve(resolvedRoot, normalize(relPath))
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + sep)) {
    throw new Error('Path escapes the workspace root')
  }
  return full
}

/**
 * IDE のファイル操作（一覧・読み込み・保存）。
 * §6: renderer から渡る相対パスは字面とシンボリックリンク実体の両方で検証する。
 * ルート自体の許可は WorkspaceRegistry が別途担保する。
 */
export class FileService {
  /** 実在するパスの実体がルート内にあることを検証する */
  private async assertRealPathInside(root: string, existingPath: string): Promise<void> {
    const realRoot = await realpath(resolve(root))
    const realTarget = await realpath(existingPath)
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
      throw new Error('Path escapes the workspace root (symlink)')
    }
  }

  /** 実在する最近接の祖先ディレクトリ（未作成パスの検証に使う） */
  private nearestExisting(path: string): string {
    let current = path
    while (!existsSync(current)) {
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return current
  }

  async list(root: string, relDir = ''): Promise<DirectoryListing> {
    const full = resolveInsideRoot(root, relDir)
    await this.assertRealPathInside(root, full)
    const dirents = await readdir(full, { withFileTypes: true })
    const visible = dirents.filter((d) => !ALWAYS_HIDDEN.has(d.name))
    const truncated = visible.length > MAX_ENTRIES
    const limited = truncated ? visible.slice(0, MAX_ENTRIES) : visible

    const entries: FileEntry[] = []
    for (const dirent of limited) {
      const childRel = relDir ? `${relDir}/${dirent.name}` : dirent.name
      // symlink はリンク先を辿らず種別のみ表示（辿るのは検証済みの read/write 経路だけ）
      const isDirectory = dirent.isDirectory()
      let size: number | undefined
      if (!isDirectory) {
        try {
          size = (await stat(join(full, dirent.name))).size
        } catch {
          size = undefined
        }
      }
      entries.push({ name: dirent.name, path: childRel, isDirectory, size })
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, 'ja')
    })
    return { root, path: relDir, entries, truncated }
  }

  async read(root: string, relPath: string): Promise<FileContent> {
    const full = resolveInsideRoot(root, relPath)
    await this.assertRealPathInside(root, full)
    const info = await stat(full)
    if (info.isDirectory()) {
      throw new Error('ディレクトリは開けません')
    }
    if (info.size > MAX_FILE_BYTES) {
      return { root, path: relPath, content: '', binary: false, tooLarge: true, size: info.size }
    }
    const buffer = await readFile(full)
    const binary = buffer.subarray(0, SNIFF_BYTES).includes(0)
    return {
      root,
      path: relPath,
      content: binary ? '' : buffer.toString('utf8'),
      binary,
      tooLarge: false,
      size: info.size
    }
  }

  /** 保存（既存ファイルの上書き、または新規作成）。作成前に実体検証する */
  async write(root: string, relPath: string, content: string): Promise<{ size: number }> {
    const size = Buffer.byteLength(content, 'utf8')
    if (size > MAX_FILE_BYTES) {
      throw new Error('保存できるサイズを超えています')
    }
    const full = resolveInsideRoot(root, relPath)
    // ディレクトリ作成より前に、実在する祖先の実体がルート内か検証する
    // （途中に外向き symlink があると mkdir がルート外にディレクトリを作ってしまうため）
    await this.assertRealPathInside(root, this.nearestExisting(dirname(full)))
    const parent = dirname(full)
    if (!existsSync(parent)) {
      await mkdir(parent, { recursive: true })
    }
    // 既存ファイル自体が外向き symlink の場合も弾く（writeFile はリンク先へ書くため）
    if (existsSync(full)) {
      await this.assertRealPathInside(root, full)
      const info = await stat(full)
      if (info.isDirectory()) {
        throw new Error('ディレクトリには保存できません')
      }
    }
    await writeFile(full, content, 'utf8')
    return { size }
  }
}
