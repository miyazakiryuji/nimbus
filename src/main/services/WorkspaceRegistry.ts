import { resolve, sep } from 'path'

/**
 * Renderer から渡ってくる「ルートディレクトリ」の許可リスト（§6 の多層防御）。
 *
 * ファイル読み書き・git 操作の cwd は renderer 由来の文字列なので、
 * 「ユーザーが明示的に開いた場所」だけを対象にする。登録元は
 *  - ユーザーがダイアログで開いたワークスペース
 *  - 実際に起動された Claude セッションの cwd（session-init の実測値）
 *  - タスクの worktree
 * のみ。サブディレクトリは許可（セッション cwd がサブディレクトリのことがある）。
 */
export class WorkspaceRegistry {
  private roots = new Set<string>()

  register(path: string): void {
    if (!path) return
    this.roots.add(resolve(path))
  }

  isAllowed(path: string): boolean {
    if (!path) return false
    const target = resolve(path)
    for (const root of this.roots) {
      if (target === root || target.startsWith(root + sep)) return true
    }
    return false
  }

  assertAllowed(path: string): void {
    if (!this.isAllowed(path)) {
      throw new Error(
        'このディレクトリは Nimbus に登録されていません（ワークスペースを開いてから操作してください）'
      )
    }
  }

  list(): string[] {
    return [...this.roots]
  }
}
