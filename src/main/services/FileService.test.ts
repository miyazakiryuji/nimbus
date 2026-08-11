import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileService, resolveInsideRoot } from './FileService'

describe('FileService（IDE のファイル操作・§6 パス検証）', () => {
  let root: string
  let outside: string
  const service = new FileService()

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nimbus-fs-'))
    outside = mkdtempSync(join(tmpdir(), 'nimbus-outside-'))
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, 'README.md'), '# hello\n')
    writeFileSync(join(root, 'src', 'index.ts'), 'export const a = 1\n')
    writeFileSync(join(root, '.git', 'config'), 'secret-ish\n')
    writeFileSync(join(outside, 'secret.txt'), 'top secret\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('list: ディレクトリ優先＋名前順、.git は隠す', async () => {
    const listing = await service.list(root)
    expect(listing.entries.map((e) => e.name)).toEqual(['src', 'README.md'])
    expect(listing.entries[0].isDirectory).toBe(true)
    expect(listing.entries[1].size).toBeGreaterThan(0)
    expect(listing.truncated).toBe(false)
  })

  it('list: サブディレクトリを相対パス付きで返す（遅延ツリー用）', async () => {
    const listing = await service.list(root, 'src')
    expect(listing.entries).toEqual([
      { name: 'index.ts', path: 'src/index.ts', isDirectory: false, size: 19 }
    ])
  })

  it('read: テキストファイルの内容を返す', async () => {
    const file = await service.read(root, 'README.md')
    expect(file.content).toBe('# hello\n')
    expect(file.binary).toBe(false)
    expect(file.tooLarge).toBe(false)
  })

  it('read: バイナリは content を返さず binary=true', async () => {
    writeFileSync(join(root, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00]))
    const file = await service.read(root, 'blob.bin')
    expect(file.binary).toBe(true)
    expect(file.content).toBe('')
  })

  it('read: サイズ上限超過は tooLarge=true で読み込まない', async () => {
    writeFileSync(join(root, 'big.txt'), 'x'.repeat(2_000_001))
    const file = await service.read(root, 'big.txt')
    expect(file.tooLarge).toBe(true)
    expect(file.content).toBe('')
    expect(file.size).toBeGreaterThan(2_000_000)
  })

  it('read: ディレクトリは開けない', async () => {
    await expect(service.read(root, 'src')).rejects.toThrow('ディレクトリは開けません')
  })

  it('write: 既存ファイルの上書きと新規作成（親ディレクトリも作成）', async () => {
    await service.write(root, 'README.md', '# updated\n')
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('# updated\n')

    await service.write(root, 'src/new/deep.ts', 'export const b = 2\n')
    expect(readFileSync(join(root, 'src/new/deep.ts'), 'utf8')).toBe('export const b = 2\n')
  })

  it('write: サイズ上限を超える保存を拒否する', async () => {
    await expect(service.write(root, 'huge.txt', 'x'.repeat(2_000_001))).rejects.toThrow(
      '保存できるサイズ'
    )
  })

  it('パス検証: 絶対パス・../ 脱出を字面で拒否する', () => {
    expect(() => resolveInsideRoot(root, '/etc/passwd')).toThrow('must be relative')
    expect(() => resolveInsideRoot(root, '../outside.txt')).toThrow('escapes')
    expect(() => resolveInsideRoot(root, 'src/../../outside.txt')).toThrow('escapes')
    expect(resolveInsideRoot(root, 'src/index.ts')).toBe(join(root, 'src/index.ts'))
  })

  it('パス検証: symlink 経由の読み出し脱出を拒否する', async () => {
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt'))
    await expect(service.read(root, 'link.txt')).rejects.toThrow('symlink')
  })

  it('パス検証: symlink ディレクトリ経由の書き込み脱出を拒否する（作成前に検証）', async () => {
    symlinkSync(outside, join(root, 'escape'))
    await expect(service.write(root, 'escape/planted.txt', 'x')).rejects.toThrow('symlink')
    expect(existsSync(join(outside, 'planted.txt'))).toBe(false)

    // 未作成の深い階層でも、symlink 越しならディレクトリを作らせない
    await expect(service.write(root, 'escape/deep/planted.txt', 'x')).rejects.toThrow('symlink')
    expect(existsSync(join(outside, 'deep'))).toBe(false)
  })

  it('パス検証: 既存ファイルが外向き symlink なら上書きしない', async () => {
    symlinkSync(join(outside, 'secret.txt'), join(root, 'alias.txt'))
    await expect(service.write(root, 'alias.txt', 'overwritten')).rejects.toThrow('symlink')
    expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('top secret\n')
  })

  it('list: 巨大ディレクトリは上限で打ち切る', async () => {
    const many = join(root, 'many')
    mkdirSync(many)
    for (let i = 0; i < 2_100; i++) writeFileSync(join(many, `f${i}.txt`), '')
    const listing = await service.list(root, 'many')
    expect(listing.truncated).toBe(true)
    expect(listing.entries).toHaveLength(2_000)
  })
})
