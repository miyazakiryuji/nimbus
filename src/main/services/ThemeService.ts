import { EventEmitter } from 'events'
import { existsSync, readFileSync, readdirSync, watch, type FSWatcher } from 'fs'
import { basename, join } from 'path'
import { themeSchema, type Theme, type ThemeInfo } from '@shared/theme'

interface LoadedTheme {
  id: string
  theme: Theme
  source: 'builtin' | 'user'
}

/**
 * テーマのロード・監視・解決（F-8）。
 * 内蔵テーマはビルドに同梱、ユーザーテーマは ~/.nimbus/themes/*.json を
 * 置くだけで自動認識・ホットリロードされる。
 */
export class ThemeService extends EventEmitter {
  private themes = new Map<string, LoadedTheme>()
  private watcher: FSWatcher | undefined

  constructor(
    private readonly builtinThemes: Record<string, Theme>,
    private readonly userThemesDir: string
  ) {
    super()
    this.rescan()
  }

  rescan(): void {
    this.themes.clear()
    for (const [id, theme] of Object.entries(this.builtinThemes)) {
      this.themes.set(id, { id, theme, source: 'builtin' })
    }
    if (existsSync(this.userThemesDir)) {
      for (const file of readdirSync(this.userThemesDir)) {
        if (!file.endsWith('.json')) continue
        try {
          const raw = JSON.parse(readFileSync(join(this.userThemesDir, file), 'utf8'))
          const parsed = themeSchema.safeParse(raw)
          if (!parsed.success) {
            console.warn(`[nimbus:theme] invalid theme skipped: ${file}`)
            continue
          }
          const id = `user:${basename(file, '.json')}`
          this.themes.set(id, { id, theme: parsed.data, source: 'user' })
        } catch {
          console.warn(`[nimbus:theme] unreadable theme skipped: ${file}`)
        }
      }
    }
  }

  /** ~/.nimbus/themes/ の変更を監視してホットリロード */
  startWatching(): void {
    if (this.watcher || !existsSync(this.userThemesDir)) return
    try {
      this.watcher = watch(this.userThemesDir, () => {
        this.rescan()
        this.emit('changed')
      })
    } catch (error) {
      console.warn('[nimbus:theme] failed to watch user themes dir', error)
    }
  }

  stopWatching(): void {
    this.watcher?.close()
    this.watcher = undefined
  }

  list(): ThemeInfo[] {
    return [...this.themes.values()].map((t) => ({
      id: t.id,
      name: t.theme.name,
      type: t.theme.type,
      source: t.source
    }))
  }

  /**
   * settings の選択値（'system' 含む）を実テーマに解決する。
   * 'system' は OS のダークモード状態で Nimbus Dark / Light を選ぶ。
   */
  resolve(selected: string, prefersDark: boolean): { id: string; theme: Theme } {
    if (selected !== 'system') {
      const found = this.themes.get(selected)
      if (found) return { id: found.id, theme: found.theme }
      console.warn(`[nimbus:theme] unknown theme '${selected}' — falling back`)
    }
    const fallbackId = prefersDark ? 'nimbus-dark' : 'nimbus-light'
    const fallback = this.themes.get(fallbackId)
    if (!fallback) {
      throw new Error(`Builtin theme missing: ${fallbackId}`)
    }
    return { id: fallback.id, theme: fallback.theme }
  }
}
