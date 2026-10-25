// Optional local-only retention cleanup for completed NSIS installers.
// It never modifies GitHub workflow artifacts, source or non-NightNova files.
import { readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
const dir = path.resolve('release')
const keep = 3
try {
  const records = []
  for (const name of await readdir(dir)) {
    if (!/^NightNova-[\w.+-]+-setup\.exe$/i.test(name)) continue
    const file = path.join(dir, name)
    const info = await stat(file)
    if (info.isFile()) records.push({ name, file, mtime: info.mtimeMs })
  }
  records.sort((a, b) => b.mtime - a.mtime)
  if (!process.argv.includes('--apply')) {
    console.log('[NightNova] Dry run: would delete ' +
      records.slice(keep).map((item) => item.name).join(', '))
    console.log('Pass --apply to remove old local NSIS installers, retaining the newest ' + keep + '.')
  } else {
    for (const item of records.slice(keep)) {
      await unlink(item.file)
      console.log('[NightNova] Removed local file: ' + item.name)
    }
    console.log('[NightNova] Retained ' + Math.min(keep, records.length) + ' local installers.')
  }
} catch (error) {
  if (error.code === 'ENOENT') console.log('[NightNova] No release directory; nothing to prune.')
  else throw error
}
