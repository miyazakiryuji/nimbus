import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileWatcher, type WatchFn } from './FileWatcher'

/** fs.watch を差し替えたフェイク（リスナーを手動で発火できる） */
function fakeWatch(): {
  watchFn: WatchFn
  fire: (root: string, filename: string | null) => void
  closed: string[]
  watchCalls: string[]
} {
  const listeners = new Map<string, (event: string, filename: string | null) => void>()
  const closed: string[] = []
  const watchCalls: string[] = []
  const watchFn: WatchFn = (path, _options, listener) => {
    watchCalls.push(path)
    listeners.set(path, listener)
    return {
      close: () => closed.push(path),
      on: () => undefined
    } as unknown as ReturnType<WatchFn>
  }
  return {
    watchFn,
    fire: (root, filename) => listeners.get(root)?.('change', filename),
    closed,
    watchCalls
  }
}

describe('FileWatcher（外部変更の自動反映）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('短時間の連続変更を 1 回にまとめて通知する（デバウンス）', () => {
    const changes: Array<{ root: string; paths: string[] }> = []
    const { watchFn, fire } = fakeWatch()
    const watcher = new FileWatcher((root, paths) => changes.push({ root, paths }), 300, watchFn)
    watcher.ensure('/repo')

    fire('/repo', 'a.txt')
    fire('/repo', 'b.txt')
    fire('/repo', 'a.txt')
    vi.advanceTimersByTime(299)
    expect(changes).toHaveLength(0)

    vi.advanceTimersByTime(1)
    expect(changes).toHaveLength(1)
    expect(changes[0].root).toBe('/repo')
    expect(changes[0].paths.sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('デバウンス経過後の変更は次の通知になる', () => {
    const changes: string[][] = []
    const { watchFn, fire } = fakeWatch()
    const watcher = new FileWatcher((_root, paths) => changes.push(paths), 100, watchFn)
    watcher.ensure('/repo')

    fire('/repo', 'x.txt')
    vi.advanceTimersByTime(100)
    fire('/repo', 'y.txt')
    vi.advanceTimersByTime(100)
    expect(changes).toEqual([['x.txt'], ['y.txt']])
  })

  it('.git 配下の変更は通知しない（git 操作でフィードが溢れるのを防ぐ）', () => {
    const changes: string[][] = []
    const { watchFn, fire } = fakeWatch()
    const watcher = new FileWatcher((_root, paths) => changes.push(paths), 50, watchFn)
    watcher.ensure('/repo')

    fire('/repo', '.git/index')
    fire('/repo', '.git')
    vi.advanceTimersByTime(50)
    expect(changes).toHaveLength(0)

    fire('/repo', 'src/app.ts')
    vi.advanceTimersByTime(50)
    expect(changes).toEqual([['src/app.ts']])
  })

  it('同じルートを二重に監視しない（ensure は冪等）', () => {
    const { watchFn, watchCalls } = fakeWatch()
    const watcher = new FileWatcher(() => undefined, 50, watchFn)
    watcher.ensure('/repo')
    watcher.ensure('/repo')
    expect(watchCalls).toEqual(['/repo'])
    expect(watcher.watchedRoots).toEqual(['/repo'])
  })

  it('closeAll で全監視を解除し、以後は通知しない', () => {
    const changes: string[][] = []
    const { watchFn, fire, closed } = fakeWatch()
    const watcher = new FileWatcher((_root, paths) => changes.push(paths), 50, watchFn)
    watcher.ensure('/a')
    watcher.ensure('/b')
    fire('/a', 'pending.txt')
    watcher.closeAll()
    vi.advanceTimersByTime(100)

    expect(closed.sort()).toEqual(['/a', '/b'])
    expect(watcher.watchedRoots).toEqual([])
    expect(changes).toHaveLength(0)
  })

  it('watch が例外を投げても落ちない（監視非対応環境）', () => {
    const throwing: WatchFn = () => {
      throw new Error('ENOSYS')
    }
    const watcher = new FileWatcher(() => undefined, 50, throwing)
    expect(() => watcher.ensure('/repo')).not.toThrow()
    expect(watcher.watchedRoots).toEqual([])
  })
})
