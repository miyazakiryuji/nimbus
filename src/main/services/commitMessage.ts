import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { GitService } from './GitService'

const DIFF_LIMIT = 12_000

/**
 * コミットメッセージ自動生成（ユーザー要望）。
 * staged diff（なければ unstaged）を Claude ワンショットに渡し、
 * Conventional Commits 形式のメッセージのみを受け取る。
 * 履歴を汚さない（persistSession: false）・ツールなし・ユーザー設定を読み込まない。
 */
export async function generateCommitMessage(
  cwd: string,
  git: GitService,
  optionsProvider?: () => Promise<Partial<Options>>
): Promise<string> {
  const { stagedDiff, unstagedDiff, untracked } = await git.collectDiff(cwd)
  const diff = stagedDiff.trim() ? stagedDiff : unstagedDiff
  if (!diff.trim() && untracked.length === 0) {
    throw new Error('変更がありません')
  }
  const truncated = diff.slice(0, DIFF_LIMIT)
  const untrackedNote = untracked.length > 0 ? `\n未追跡ファイル: ${untracked.join(', ')}` : ''
  const extra = (await optionsProvider?.()) ?? {}

  const q = query({
    prompt: `以下の git diff に対する Conventional Commits 形式のコミットメッセージを日本語で生成してください。1 行目は「type: 要約」（72 文字以内）、必要な場合のみ空行を挟んで簡潔な本文。**コミットメッセージ本文のみを出力してください（説明・引用符・コードブロックは不要）。**${untrackedNote}\n\n\`\`\`diff\n${truncated}\n\`\`\``,
    options: {
      ...extra,
      cwd,
      permissionMode: 'default',
      persistSession: false,
      maxTurns: 1,
      settingSources: [],
      tools: [],
      mcpServers: {},
      strictMcpConfig: true
    }
  })

  let text = ''
  for await (const message of q) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') text += block.text
      }
    }
    if (message.type === 'result') break
  }
  const cleaned = text.trim().replace(/^```[a-z]*\n?|```$/g, '')
  if (!cleaned) throw new Error('メッセージを生成できませんでした')
  return cleaned
}
