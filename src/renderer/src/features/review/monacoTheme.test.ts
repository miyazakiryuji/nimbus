import { describe, expect, it } from 'vitest'
import type { ThemeState } from '@shared/theme'
import { monacoThemeFor } from './monacoTheme'

const state = (type: 'dark' | 'light' | 'highContrast'): ThemeState => ({
  themes: [{ id: 'x', name: 'X', type, source: 'builtin' }],
  selected: 'x',
  activeThemeId: 'x',
  cssVars: {},
  font: {}
})

describe('monacoThemeFor', () => {
  it('テーマ type に応じた Monaco テーマを返す', () => {
    expect(monacoThemeFor(state('dark'))).toBe('vs-dark')
    expect(monacoThemeFor(state('light'))).toBe('vs')
    expect(monacoThemeFor(state('highContrast'))).toBe('hc-black')
  })

  it('未取得（null）や未知 id ではダークにフォールバックする', () => {
    expect(monacoThemeFor(null)).toBe('vs-dark')
    expect(monacoThemeFor({ ...state('light'), activeThemeId: 'missing' })).toBe('vs-dark')
  })
})
