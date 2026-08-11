import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * パッケージ版で SDK 同梱の Claude Code バイナリを asar 外（app.asar.unpacked）から解決する。
 * Electron は child_process.spawn を asar 用にパッチしないため、SDK の自動解決
 * （asar 内パス）は ENOTDIR で失敗する。unpacked 側の実体パスを
 * pathToClaudeCodeExecutable として明示的に渡す必要がある。
 */
export function resolveBundledClaudeBinary(resourcesPath: string): string | undefined {
  const base = join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai')
  if (!existsSync(base)) return undefined
  try {
    for (const entry of readdirSync(base)) {
      if (!entry.startsWith('claude-agent-sdk-')) continue
      for (const name of ['claude', 'claude.exe']) {
        const candidate = join(base, entry, name)
        if (existsSync(candidate)) return candidate
      }
    }
  } catch {
    return undefined
  }
  return undefined
}
