import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { ApprovalScope, ApprovalSummary } from '@shared/approvals'

interface PendingApproval {
  id: string
  sessionId: string
  cwd: string
  toolName: string
  input: Record<string, unknown>
  createdAt: number
  resolve: (result: PermissionResult) => void
}

const INPUT_PREVIEW_LIMIT = 800

function extractTargetPath(input: Record<string, unknown>): string | undefined {
  for (const key of ['file_path', 'path', 'notebook_path', 'cwd']) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  const command = input['command']
  if (typeof command === 'string') return command.slice(0, 120)
  return undefined
}

function toPreview(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 1).slice(0, INPUT_PREVIEW_LIMIT)
  } catch {
    return '[unserializable input]'
  }
}

/**
 * F-3: ツール実行前フック（canUseTool）を横取りし、承認待ちキューへ積む。
 * §10 検証 3: canUseTool にタイムアウトは無く無期限保留できる（承認インボックスに最適）。
 * キューは全セッション横断の 1 本で、各エントリがセッション帰属を持つ（§3 原則 5）。
 */
export class PermissionBroker extends EventEmitter {
  private pending = new Map<string, PendingApproval>()
  /** sessionId → 自動承認するツール名集合 */
  private sessionRules = new Map<string, Set<string>>()
  /** cwd（ワークスペース）→ 自動承認するツール名集合 */
  private workspaceRules = new Map<string, Set<string>>()

  /** SessionManager に注入する canUseTool コールバックを生成する */
  createCanUseTool(sessionId: string, cwd: string): CanUseTool {
    return (toolName, input, options) => {
      if (this.isAutoApproved(sessionId, cwd, toolName)) {
        return Promise.resolve({ behavior: 'allow', updatedInput: input } as PermissionResult)
      }
      return new Promise<PermissionResult>((resolve) => {
        const id = randomUUID()
        const entry: PendingApproval = {
          id,
          sessionId,
          cwd,
          toolName,
          input,
          createdAt: Date.now(),
          resolve
        }
        this.pending.set(id, entry)
        // クエリ側が中断されたら承認待ちを取り下げる
        options.signal.addEventListener('abort', () => {
          if (this.pending.delete(id)) {
            resolve({ behavior: 'deny', message: 'Query aborted before approval' })
            this.emitChanged()
          }
        })
        this.emit('added', this.toSummary(entry))
        this.emitChanged()
      })
    }
  }

  list(): ApprovalSummary[] {
    return [...this.pending.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((p) => this.toSummary(p))
  }

  /** 個別 or まとめて承認。always 指定でセッション/ワークスペース単位の自動承認ルールを登録 */
  approve(ids: string[], always?: ApprovalScope): number {
    let count = 0
    for (const id of ids) {
      const entry = this.pending.get(id)
      if (!entry) continue
      if (always === 'session') {
        this.addRule(this.sessionRules, entry.sessionId, entry.toolName)
      } else if (always === 'workspace') {
        this.addRule(this.workspaceRules, entry.cwd, entry.toolName)
      }
      this.pending.delete(id)
      entry.resolve({ behavior: 'allow', updatedInput: entry.input })
      count++
    }
    if (count > 0) this.emitChanged()
    return count
  }

  deny(ids: string[], message = 'ユーザーが承認インボックスで拒否しました'): number {
    let count = 0
    for (const id of ids) {
      const entry = this.pending.get(id)
      if (!entry) continue
      this.pending.delete(id)
      entry.resolve({ behavior: 'deny', message })
      count++
    }
    if (count > 0) this.emitChanged()
    return count
  }

  isAutoApproved(sessionId: string, cwd: string, toolName: string): boolean {
    return (
      (this.sessionRules.get(sessionId)?.has(toolName) ?? false) ||
      (this.workspaceRules.get(cwd)?.has(toolName) ?? false)
    )
  }

  private addRule(map: Map<string, Set<string>>, key: string, toolName: string): void {
    const set = map.get(key) ?? new Set<string>()
    set.add(toolName)
    map.set(key, set)
  }

  private toSummary(entry: PendingApproval): ApprovalSummary {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      cwd: entry.cwd,
      toolName: entry.toolName,
      inputPreview: toPreview(entry.input),
      targetPath: extractTargetPath(entry.input),
      createdAt: entry.createdAt
    }
  }

  private emitChanged(): void {
    this.emit('changed', this.list())
  }
}
