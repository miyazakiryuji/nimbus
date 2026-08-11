import { describe, expect, it, vi } from 'vitest'

// monaco 本体は DOM/worker を要求するため、必要な API だけをモックする
vi.mock('monaco-editor', () => ({
  Uri: { parse: (value: string) => ({ toString: () => value, value }) },
  editor: {},
  languages: {},
  typescript: {}
}))
vi.mock('monaco-editor/editor/editor.worker.js?worker', () => ({ default: class {} }))
vi.mock('monaco-editor/language/json/json.worker.js?worker', () => ({ default: class {} }))
vi.mock('monaco-editor/language/css/css.worker.js?worker', () => ({ default: class {} }))
vi.mock('monaco-editor/language/html/html.worker.js?worker', () => ({ default: class {} }))
vi.mock('monaco-editor/language/typescript/ts.worker.js?worker', () => ({ default: class {} }))

const { EDITOR_DEFAULTS, languageForPath, modelUriFor } = await import('./monacoSetup')

describe('languageForPath', () => {
  it('拡張子から言語 id を判定する', () => {
    expect(languageForPath('src/app.ts')).toBe('typescript')
    expect(languageForPath('src/App.tsx')).toBe('typescript')
    expect(languageForPath('script.mjs')).toBe('javascript')
    expect(languageForPath('data.JSON')).toBe('json')
    expect(languageForPath('README.md')).toBe('markdown')
  })

  it('未知・拡張子なしは plaintext', () => {
    expect(languageForPath('Makefile')).toBe('plaintext')
    expect(languageForPath('notes.unknownext')).toBe('plaintext')
  })
})

describe('modelUriFor（コード補完のための file:// モデル URI）', () => {
  it('ルートと相対パスから file:// URI を作る', () => {
    expect(modelUriFor('/repo', 'src/app.ts').toString()).toBe('file:///repo/src/app.ts')
  })

  it('ルート末尾のスラッシュを重複させない', () => {
    expect(modelUriFor('/repo/', 'src/app.ts').toString()).toBe('file:///repo/src/app.ts')
  })

  it('同じファイルは常に同じ URI（モデル再利用の前提）', () => {
    expect(modelUriFor('/repo', 'a.ts').toString()).toBe(modelUriFor('/repo', 'a.ts').toString())
  })
})

describe('EDITOR_DEFAULTS（IDE 相当の補完設定）', () => {
  it('コード補完まわりが有効になっている', () => {
    expect(EDITOR_DEFAULTS.suggestOnTriggerCharacters).toBe(true)
    expect(EDITOR_DEFAULTS.tabCompletion).toBe('on')
    expect(EDITOR_DEFAULTS.quickSuggestions).toMatchObject({ other: true })
    expect(EDITOR_DEFAULTS.parameterHints).toMatchObject({ enabled: true })
  })
})
