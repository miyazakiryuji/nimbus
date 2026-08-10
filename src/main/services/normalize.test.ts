import { describe, expect, it } from 'vitest'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { nimbusEventSchema } from '@shared/events'
import { normalizeSdkMessage } from './normalize'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const now = (): number => 1_700_000_000_000

function asSdk(msg: unknown): SDKMessage {
  return msg as SDKMessage
}

describe('normalizeSdkMessage', () => {
  it('system/init → session-init（全メタデータを写像する）', () => {
    const events = normalizeSdkMessage(
      asSdk({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-1',
        claude_code_version: '2.1.226',
        model: 'claude-fable-5',
        cwd: '/tmp/project',
        permissionMode: 'default',
        apiKeySource: 'oauth',
        tools: ['Read', 'Bash'],
        mcp_servers: [{ name: 'srv', status: 'connected' }],
        plugins: [{ name: 'plug', path: '/p', version: '1.0.0' }],
        skills: ['skillA'],
        slash_commands: ['/help'],
        agents: ['general-purpose'],
        uuid: 'u-1'
      }),
      SESSION_ID,
      now
    )
    expect(events).toHaveLength(1)
    const init = events[0]
    expect(init).toMatchObject({
      kind: 'session-init',
      sessionId: SESSION_ID,
      timestamp: now(),
      claudeSessionId: 'claude-session-1',
      claudeCodeVersion: '2.1.226',
      model: 'claude-fable-5',
      permissionMode: 'default',
      apiKeySource: 'oauth',
      tools: ['Read', 'Bash'],
      mcpServers: [{ name: 'srv', status: 'connected' }],
      plugins: [{ name: 'plug', version: '1.0.0' }],
      skills: ['skillA'],
      slashCommands: ['/help']
    })
  })

  it('assistant の text / thinking / tool_use ブロックをそれぞれ正規化する', () => {
    const events = normalizeSdkMessage(
      asSdk({
        type: 'assistant',
        parent_tool_use_id: null,
        session_id: 'claude-session-1',
        uuid: 'u-2',
        message: {
          id: 'msg_1',
          content: [
            { type: 'thinking', thinking: '考え中…' },
            { type: 'text', text: 'こんにちは' },
            { type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }
          ]
        }
      }),
      SESSION_ID,
      now
    )
    expect(events.map((e) => e.kind)).toEqual(['assistant-thinking', 'assistant-text', 'tool-use'])
    expect(events[1]).toMatchObject({ text: 'こんにちは' })
    expect(events[2]).toMatchObject({ toolUseId: 'tu_1', toolName: 'Bash' })
  })

  it('サブエージェント由来の assistant（parent_tool_use_id あり）は無視する', () => {
    const events = normalizeSdkMessage(
      asSdk({
        type: 'assistant',
        parent_tool_use_id: 'tu_parent',
        session_id: 's',
        uuid: 'u',
        message: { id: 'm', content: [{ type: 'text', text: 'sub' }] }
      }),
      SESSION_ID,
      now
    )
    expect(events).toEqual([])
  })

  it('user の tool_result ブロック → tool-result（文字列/配列コンテンツ両対応）', () => {
    const events = normalizeSdkMessage(
      asSdk({
        type: 'user',
        parent_tool_use_id: null,
        session_id: 's',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu_1', content: 'file1\nfile2' },
            {
              type: 'tool_result',
              tool_use_id: 'tu_2',
              is_error: true,
              content: [{ type: 'text', text: 'boom' }]
            }
          ]
        }
      }),
      SESSION_ID,
      now
    )
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      kind: 'tool-result',
      toolUseId: 'tu_1',
      isError: false,
      preview: 'file1\nfile2'
    })
    expect(events[1]).toMatchObject({ kind: 'tool-result', toolUseId: 'tu_2', isError: true })
  })

  it('result/success → turn-result（累積コストと usage を写像する）', () => {
    const events = normalizeSdkMessage(
      asSdk({
        type: 'result',
        subtype: 'success',
        is_error: false,
        num_turns: 2,
        duration_ms: 4321,
        duration_api_ms: 4000,
        total_cost_usd: 0.1234,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 20
        },
        modelUsage: {},
        permission_denials: [],
        result: 'done',
        stop_reason: 'end_turn',
        session_id: 's',
        uuid: 'u'
      }),
      SESSION_ID,
      now
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'turn-result',
      subtype: 'success',
      isError: false,
      numTurns: 2,
      durationMs: 4321,
      totalCostUsd: 0.1234,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 20
      },
      resultText: 'done'
    })
  })

  it('result/エラー系サブタイプ → turn-result（isError, usage なし）', () => {
    const events = normalizeSdkMessage(
      asSdk({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        num_turns: 1,
        duration_ms: 100,
        session_id: 's',
        uuid: 'u'
      }),
      SESSION_ID,
      now
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'turn-result',
      subtype: 'error_during_execution',
      isError: true
    })
  })

  it('result/エラー系でも累積コストと usage を写像する（過少表示の防止）', () => {
    const events = normalizeSdkMessage(
      asSdk({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        num_turns: 3,
        duration_ms: 500,
        total_cost_usd: 0.9,
        usage: { input_tokens: 10, output_tokens: 5 },
        session_id: 's',
        uuid: 'u'
      }),
      SESSION_ID,
      now
    )
    expect(events[0]).toMatchObject({
      kind: 'turn-result',
      isError: true,
      totalCostUsd: 0.9,
      usage: { inputTokens: 10, outputTokens: 5 }
    })
    expect(events[0]).not.toHaveProperty('resultText', expect.anything())
  })

  it('resume 時の履歴リプレイ（isReplay: true）は再流出させない', () => {
    const events = normalizeSdkMessage(
      asSdk({
        type: 'user',
        isReplay: true,
        parent_tool_use_id: null,
        session_id: 's',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu_old', content: 'old result' }]
        }
      }),
      SESSION_ID,
      now
    )
    expect(events).toEqual([])
  })

  it('未知のメッセージ種別は空配列（無視）', () => {
    expect(normalizeSdkMessage(asSdk({ type: 'stream_event' }), SESSION_ID, now)).toEqual([])
    expect(normalizeSdkMessage(asSdk({ type: 'task_progress' }), SESSION_ID, now)).toEqual([])
  })

  it('生成される全イベントが shared スキーマ（IPC 境界の検証）を通過する', () => {
    const samples: unknown[] = [
      {
        type: 'assistant',
        parent_tool_use_id: null,
        session_id: 's',
        uuid: 'u',
        message: { id: 'm', content: [{ type: 'text', text: 'hi' }] }
      }
    ]
    for (const sample of samples) {
      for (const event of normalizeSdkMessage(asSdk(sample), SESSION_ID, now)) {
        expect(() => nimbusEventSchema.parse(event)).not.toThrow()
      }
    }
  })
})
