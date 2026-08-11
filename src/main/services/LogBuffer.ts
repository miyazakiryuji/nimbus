export interface LogEntry {
  timestamp: number
  level: 'log' | 'warn' | 'error'
  message: string
}

/**
 * 診断ビュー用のリングバッファ（不具合調査画面）。
 * §6-2/6-3: 追記時に必ずサニタイザを通す — このログは
 * 「ユーザーが issue にそのまま貼れる」ことを設計目標とする。
 */
export class LogBuffer {
  private entries: LogEntry[] = []

  constructor(
    private readonly sanitize: (s: string) => string,
    private readonly capacity = 500
  ) {}

  append(level: LogEntry['level'], parts: unknown[]): void {
    const message = parts
      .map((p) => {
        if (typeof p === 'string') return p
        if (p instanceof Error) return `${p.name}: ${p.message}\n${p.stack ?? ''}`
        try {
          return JSON.stringify(p)
        } catch {
          return String(p)
        }
      })
      .join(' ')
    this.entries.push({ timestamp: Date.now(), level, message: this.sanitize(message) })
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity)
    }
  }

  list(): LogEntry[] {
    return [...this.entries]
  }

  clear(): void {
    this.entries = []
  }

  /**
   * console 出力をこのバッファへも流す（元の出力は維持）。
   * 注意: process の 'uncaughtException' リスナーは登録しない。
   * Electron の main プロセスは自前の uncaughtException ハンドラで
   * クラッシュダイアログを表示するが、追加リスナーがあるとそれが抑止されてしまう
   * （致命エラーが無警告で握り潰される）ため、ここでは触らない。
   * アプリ内のエラーは大半が console.error 経由なのでこのパッチで捕捉できる。
   */
  install(): void {
    for (const level of ['log', 'warn', 'error'] as const) {
      const original = console[level].bind(console)
      console[level] = (...args: unknown[]): void => {
        original(...args)
        this.append(level, args)
      }
    }
  }
}
