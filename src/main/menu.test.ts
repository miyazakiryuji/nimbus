import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '@shared/menu'
import { buildMenuTemplate } from './menu'

function labels(template: MenuItemConstructorOptions[]): string[] {
  return template.map((item) => String(item.label))
}

function findItem(
  template: MenuItemConstructorOptions[],
  menuLabel: string,
  itemLabel: string
): MenuItemConstructorOptions | undefined {
  const menu = template.find((m) => m.label === menuLabel)
  const submenu = (menu?.submenu ?? []) as MenuItemConstructorOptions[]
  return submenu.find((i) => i.label === itemLabel)
}

function setup(isMac: boolean): {
  template: MenuItemConstructorOptions[]
  sent: MenuAction[]
  openRepo: ReturnType<typeof vi.fn>
} {
  const sent: MenuAction[] = []
  const openRepo = vi.fn()
  const template = buildMenuTemplate({ send: (a) => sent.push(a), openRepo }, { isMac })
  return { template, sent, openRepo }
}

describe('buildMenuTemplate（ネイティブメニュー）', () => {
  it('Windows/Linux ではファイル/編集/表示/ヘルプの 4 メニュー', () => {
    expect(labels(setup(false).template)).toEqual(['ファイル', '編集', '表示', 'ヘルプ'])
  })

  it('macOS ではアプリメニューが先頭に付く', () => {
    expect(labels(setup(true).template)[0]).toBe('Nimbus')
  })

  it('フォルダを開くは CmdOrCtrl+O で open-folder を送る', () => {
    const { template, sent } = setup(false)
    const item = findItem(template, 'ファイル', 'フォルダを開く…')
    expect(item?.accelerator).toBe('CmdOrCtrl+O')
    ;(item?.click as () => void)()
    expect(sent).toEqual(['open-folder'])
  })

  it('保存は CmdOrCtrl+S で save を送る', () => {
    const { template, sent } = setup(false)
    const item = findItem(template, 'ファイル', '保存')
    expect(item?.accelerator).toBe('CmdOrCtrl+S')
    ;(item?.click as () => void)()
    expect(sent).toEqual(['save'])
  })

  it('表示メニューの 6 ビューが ⌘1..⌘5 と ⌘, に割り当てられている', () => {
    const { template, sent } = setup(false)
    const expected: Array<[string, string, MenuAction]> = [
      ['コックピット', 'CmdOrCtrl+1', 'view:cockpit'],
      ['エディタ', 'CmdOrCtrl+2', 'view:explorer'],
      ['ボード', 'CmdOrCtrl+3', 'view:board'],
      ['レビュー', 'CmdOrCtrl+4', 'view:review'],
      ['診断', 'CmdOrCtrl+5', 'view:diagnostics'],
      ['設定', 'CmdOrCtrl+,', 'view:settings']
    ]
    for (const [label, accelerator, action] of expected) {
      const item = findItem(template, '表示', label)
      expect(item?.accelerator, label).toBe(accelerator)
      ;(item?.click as () => void)()
      expect(sent.at(-1)).toBe(action)
    }
  })

  it('ヘルプからリポジトリを開ける', () => {
    const { template, openRepo } = setup(false)
    const item = findItem(template, 'ヘルプ', 'GitHub リポジトリを開く')
    ;(item?.click as () => void)()
    expect(openRepo).toHaveBeenCalledOnce()
  })

  it('編集メニューはロールで構成される（コピー/貼り付けが OS 標準で動く）', () => {
    const { template } = setup(false)
    const submenu = (template.find((m) => m.label === '編集')?.submenu ??
      []) as MenuItemConstructorOptions[]
    const roles = submenu.map((i) => i.role).filter(Boolean)
    expect(roles).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])
  })
})
