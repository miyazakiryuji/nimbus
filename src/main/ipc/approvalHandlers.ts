import { ipcMain, Notification } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { approvalSummarySchema, type ApprovalSummary } from '@shared/approvals'
import { approvalsApproveRequestSchema, approvalsDenyRequestSchema } from '@shared/ipc-schemas'
import type { PermissionBroker } from '../services/PermissionBroker'
import { broadcastToWindows } from './broadcast'

const approvalsListSchema = z.array(approvalSummarySchema)

/** F-3 承認インボックスの IPC。キュー変更は全ウィンドウへ push、新規は OS 通知 */
export function registerApprovalIpc(broker: PermissionBroker): void {
  ipcMain.handle(IPC_CHANNELS.approvalsList, () => approvalsListSchema.parse(broker.list()))

  ipcMain.handle(IPC_CHANNELS.approvalsApprove, (_event, raw: unknown) => {
    const req = approvalsApproveRequestSchema.parse(raw)
    return { count: broker.approve(req.ids, req.always) }
  })

  ipcMain.handle(IPC_CHANNELS.approvalsDeny, (_event, raw: unknown) => {
    const req = approvalsDenyRequestSchema.parse(raw)
    return { count: broker.deny(req.ids) }
  })

  broker.on('changed', (list: ApprovalSummary[]) => {
    const parsed = approvalsListSchema.parse(list)
    broadcastToWindows(IPC_CHANNELS.approvalsChanged, parsed)
  })

  broker.on('added', (summary: ApprovalSummary) => {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Nimbus: 承認待ち',
        body: `${summary.toolName} — ${summary.targetPath ?? summary.cwd}`
      }).show()
    }
  })
}
