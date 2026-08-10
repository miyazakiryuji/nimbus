import { describe, expect, it } from 'vitest'
import { buildCssVars, themeSchema, type Theme } from './theme'

const theme: Theme = {
  name: 'T',
  type: 'dark',
  colors: {
    'editor.background': '#111111',
    'editor.foreground': '#eeeeee',
    'nimbus.accent': '#ffcc00',
    'unknown.key': '#123456'
  }
}

describe('themeSchema', () => {
  it('正しいテーマ定義を受け入れる', () => {
    expect(themeSchema.safeParse(theme).success).toBe(true)
  })

  it('type が不正なテーマを拒否する', () => {
    expect(themeSchema.safeParse({ ...theme, type: 'neon' }).success).toBe(false)
  })

  it('name 欠落を拒否する', () => {
    const rest = { type: theme.type, colors: theme.colors }
    expect(themeSchema.safeParse(rest).success).toBe(false)
  })
})

describe('buildCssVars', () => {
  it('VS Code キー → --nimbus-* 変数へ写像し、未知キーは無視する', () => {
    const vars = buildCssVars(theme)
    expect(vars['--nimbus-color-background']).toBe('#111111')
    expect(vars['--nimbus-color-foreground']).toBe('#eeeeee')
    expect(vars['--nimbus-color-accent']).toBe('#ffcc00')
    expect(Object.values(vars)).not.toContain('#123456')
  })

  it('フォント設定が CSS 変数になる', () => {
    const vars = buildCssVars(theme, { fontFamily: 'Osaka', fontSize: 16, lineHeight: 1.8 })
    expect(vars['--nimbus-font-family']).toBe('Osaka')
    expect(vars['--nimbus-font-size']).toBe('16px')
    expect(vars['--nimbus-line-height']).toBe('1.8')
  })

  it('フォント未設定なら フォント変数を出さない（main.css の既定にフォールバック）', () => {
    const vars = buildCssVars(theme, {})
    expect(vars['--nimbus-font-family']).toBeUndefined()
    expect(vars['--nimbus-font-size']).toBeUndefined()
  })
})
