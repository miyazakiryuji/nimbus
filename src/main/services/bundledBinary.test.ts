import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveBundledClaudeBinary } from './bundledBinary'

describe('resolveBundledClaudeBinary（パッケージ版の同梱 CLI 解決）', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nimbus-bin-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('unpacked 配下のプラットフォームパッケージから claude バイナリを見つける', () => {
    const pkg = join(
      dir,
      'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64'
    )
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, 'claude'), '#!/bin/sh\n')
    expect(resolveBundledClaudeBinary(dir)).toBe(join(pkg, 'claude'))
  })

  it('Windows の claude.exe も解決できる', () => {
    const pkg = join(dir, 'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, 'claude.exe'), '')
    expect(resolveBundledClaudeBinary(dir)).toBe(join(pkg, 'claude.exe'))
  })

  it('見つからなければ undefined（開発モード等）', () => {
    expect(resolveBundledClaudeBinary(dir)).toBeUndefined()
    // SDK 本体はあるがバイナリパッケージが無いケース
    mkdirSync(join(dir, 'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk'), {
      recursive: true
    })
    expect(resolveBundledClaudeBinary(dir)).toBeUndefined()
  })
})
