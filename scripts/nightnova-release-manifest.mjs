// Offline, Windows-first release inventory. No upload, no GitHub Actions,
// no code-signing claim. Outputs SHA256 manifest for the local NSIS executable.
import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { cwd } from 'node:process'

const root = cwd()
const release = path.join(root, 'release')
const required = [
  path.join(root, 'out/main/index.js'),
  path.join(root, 'out/preload/index.mjs'),
  path.join(root, 'out/renderer/index.html'),
  path.join(root, 'build/icon.ico'),
  path.join(root, 'resources/icon.png')
]

const missing = []
for (const file of required) {
  try {
    if ((await stat(file)).size === 0) missing.push(path.relative(root, file) + ' (empty)')
  } catch {
    missing.push(path.relative(root, file))
  }
}
if (missing.length) {
  console.error('[Nightnova] Missing packaging prerequisites:\n' + missing.join('\n'))
  console.error('Run npm run build on the target machine before generating the release manifest.')
  process.exitCode = 1
} else {
  await mkdir(release, { recursive: true })
  const files = (await readdir(release)).filter((name) =>
    /^Nightnova-[\w.+-]+-setup\.exe$/i.test(name))
  if (!files.length) {
    console.error('[Nightnova] Windows NSIS executable is missing in release/.')
    process.exitCode = 1
  } else {
    const manifest = {
      product: 'Nightnova',
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      architecture: process.arch,
      note: 'SHA256 inventory only; not a Windows runtime acceptance or code-signing certificate.',
      files: []
    }
    for (const name of files.sort()) {
      const binary = await readFile(path.join(release, name))
      manifest.files.push({
        name, size: binary.length, sha256: createHash('sha256').update(binary).digest('hex')
      })
    }
    const output = path.join(release, 'NIGHTNOVA_RELEASE_MANIFEST.json')
    await writeFile(output, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    console.log('[Nightnova] Manifest written to ' + output)
    for (const item of manifest.files) {
      console.log(item.name + ' - ' + item.size + ' bytes - ' + item.sha256)
    }
  }
}
