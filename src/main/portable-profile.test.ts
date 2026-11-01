import { describe, expect, it } from 'vitest'
import { portableProfileDirectory } from './portable-profile'

describe('NightNova portable Windows profile isolation', () => {
  it('stores a self-contained profile beside the real portable EXE', () => {
    expect(portableProfileDirectory('win32', true, 'D:\\NightNova')).toBe(
      'D:\\NightNova\\NightNova-Data'
    )
  })

  it('never redirects a normal installer, development session or other OS', () => {
    expect(portableProfileDirectory('win32', true)).toBeNull()
    expect(portableProfileDirectory('win32', false, 'D:\\NightNova')).toBeNull()
    expect(portableProfileDirectory('darwin', true, 'D:\\NightNova')).toBeNull()
    expect(portableProfileDirectory('linux', true, 'D:\\NightNova')).toBeNull()
    expect(portableProfileDirectory('win32', true, '   ')).toBeNull()
  })
})
