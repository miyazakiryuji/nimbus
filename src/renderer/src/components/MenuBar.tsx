import { useEffect, useRef, useState } from 'react'
import { useActiveRoot } from '../hooks/useActiveRoot'
import type { AppActions } from '../hooks/useAppActions'

interface MenuItem {
  label: string
  shortcut?: string
  onClick: () => void
}

interface MenuDef {
  label: string
  items: MenuItem[]
}

/**
 * Windows の VS Code を参考にした上部メニューバー。
 * ネイティブメニュー（ショートカット）と同じアクションを呼ぶ。
 */
function MenuBar({ actions }: { actions: AppActions }): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const root = useActiveRoot()
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(null)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const menus: MenuDef[] = [
    {
      label: 'ファイル',
      items: [
        { label: 'フォルダを開く…', shortcut: '⌘O', onClick: () => void actions.openFolder() },
        { label: '保存', shortcut: '⌘S', onClick: actions.save },
        { label: '新しいタスク', shortcut: '⇧⌘N', onClick: actions.newTask }
      ]
    },
    {
      label: '表示',
      items: [
        { label: 'コックピット', shortcut: '⌘1', onClick: () => actions.showView('cockpit') },
        { label: 'エディタ', shortcut: '⌘2', onClick: () => actions.showView('explorer') },
        { label: 'ボード', shortcut: '⌘3', onClick: () => actions.showView('board') },
        { label: 'レビュー', shortcut: '⌘4', onClick: () => actions.showView('review') },
        { label: '診断', shortcut: '⌘5', onClick: () => actions.showView('diagnostics') },
        { label: '設定', shortcut: '⌘,', onClick: () => actions.showView('settings') }
      ]
    },
    {
      label: 'ヘルプ',
      items: [
        { label: 'GitHub リポジトリを開く', onClick: actions.openRepo },
        { label: '診断（不具合調査）', onClick: () => actions.showView('diagnostics') }
      ]
    }
  ]

  return (
    <div className="menubar" ref={barRef}>
      <span className="menubar-brand">Nimbus</span>
      {menus.map((menu) => (
        <div className="menubar-menu" key={menu.label}>
          <button
            className={`menubar-button ${open === menu.label ? 'menubar-button-open' : ''}`}
            onClick={() => setOpen(open === menu.label ? null : menu.label)}
            onMouseEnter={() => open && setOpen(menu.label)}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <ul className="menubar-dropdown">
              {menu.items.map((item) => (
                <li key={item.label}>
                  <button
                    className="menubar-item"
                    onClick={() => {
                      setOpen(null)
                      item.onClick()
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="menubar-shortcut">{item.shortcut}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <span className="menubar-title">{root ? root.split('/').pop() : 'フォルダ未選択'}</span>
    </div>
  )
}

export default MenuBar
