import { z } from 'zod'

/** メニュー（ネイティブ／アプリ内共通）から発火するアクション */
export const menuActionSchema = z.enum([
  'open-folder',
  'save',
  'new-task',
  'view:cockpit',
  'view:explorer',
  'view:board',
  'view:review',
  'view:diagnostics',
  'view:settings'
])
export type MenuAction = z.infer<typeof menuActionSchema>

export const NIMBUS_REPO_URL = 'https://github.com/miyazakiryuji/nimbus'
