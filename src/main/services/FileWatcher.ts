import { watch, type FSWatcher } from 'fs'

export type WatchFn = (
  path: string,
  options: { recursive: boolean },
  listener: (event: string, filename: string | null) => void
) => FSWatcher

/**
 * ワークスペースのファイル変更監視（Claude の編集をエディタへ即反映するため）。
 * 変更はデバウンスしてまとめて通知する。
 * 注意: recursive オプションは macOS / Windows のみ。Linux ではルート直下のみ監視になる。
 */
export class FileWatcher {
  private watchers = new Map<string, FSWatcher>()
  private pending = new Map<string, Set<string>>()
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly onChange: (root: string, paths: string[]) => void,
    private readonly debounceMs = 300,
    private readonly watchFn: WatchFn = watch as unknown as WatchFn
  ) {}

  /** 未監視のルートなら監視を開始する（冪等） */
  ensure(root: string): void {
    if (this.watchers.has(root)) return
    try {
      const watcher = this.watchFn(root, { recursive: true }, (_event, filename) => {
        this.enqueue(root, filename)
      })
      watcher.on?.('error', () => this.close(root))
      this.watchers.set(root, watcher)
    } catch (error) {
      console.warn('[nimbus:files] watch failed', error)
    }
  }

  private enqueue(root: string, filename: string | null): void {
    const set = this.pending.get(root) ?? new Set<string>()
    // .git 内部の更新は大量に出るのでフィードから除外する
    const normalized = filename ? filename.replace(/\\/g, '/') : ''
    if (normalized.startsWith('.git/') || normalized === '.git') return
    set.add(normalized)
    this.pending.set(root, set)

    const existing = this.timers.get(root)
    if (existing) clearTimeout(existing)
    this.timers.set(
      root,
      setTimeout(() => {
        this.timers.delete(root)
        const paths = [...(this.pending.get(root) ?? [])]
        this.pending.delete(root)
        if (paths.length > 0) this.onChange(root, paths)
      }, this.debounceMs)
    )
  }

  close(root: string): void {
    this.watchers.get(root)?.close()
    this.watchers.delete(root)
    const timer = this.timers.get(root)
    if (timer) clearTimeout(timer)
    this.timers.delete(root)
    this.pending.delete(root)
  }

  closeAll(): void {
    for (const root of [...this.watchers.keys()]) this.close(root)
  }

  get watchedRoots(): string[] {
    return [...this.watchers.keys()]
  }
}
