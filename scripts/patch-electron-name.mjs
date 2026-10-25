// Windows-safe postinstall. Dev-only macOS Dock name and menu title.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
if (process.platform === 'darwin') {
  const app = join(process.cwd(), 'node_modules/electron/dist/Electron.app')
  const plist = join(app, 'Contents/Info.plist')
  if (existsSync(plist)) {
    const buddy = '/usr/libexec/PlistBuddy'
    const run = (...args) => execFileSync(buddy, args, { stdio: 'pipe' }).toString().trim()
    try {
      run('-c', 'Set :CFBundleName NightNova', plist)
      try { run('-c', 'Set :CFBundleDisplayName NightNova', plist) }
      catch { run('-c', 'Add :CFBundleDisplayName string NightNova', plist) }
      try { execFileSync('codesign', ['--force', '--sign', '-', app], { stdio: 'ignore' }) }
      catch { /* do not block dependency install when dev signing is unavailable */ }
    } catch (error) {
      console.warn('[nightnova] macOS Electron dock rename skipped:', String(error))
    }
  }
}
