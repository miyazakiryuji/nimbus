import { describe, expect, it } from 'vitest'
import { SECURITY_WEB_PREFERENCES } from './security'

describe('SECURITY_WEB_PREFERENCES (NIMBUS_SPEC §6-5)', () => {
  it('contextIsolation を有効にしている', () => {
    expect(SECURITY_WEB_PREFERENCES.contextIsolation).toBe(true)
  })

  it('nodeIntegration を無効にしている', () => {
    expect(SECURITY_WEB_PREFERENCES.nodeIntegration).toBe(false)
  })

  it('sandbox を有効にしている', () => {
    expect(SECURITY_WEB_PREFERENCES.sandbox).toBe(true)
  })
})
