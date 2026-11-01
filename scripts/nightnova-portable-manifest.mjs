// Standalone Windows portable release verification. Does not sign or launch.
import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const dir = path.resolve('release')
const name = (await readdir(dir)).filter(name =>
  /^NightNova-[\w.+-]+-portable\.exe$/i.test(name))
if (name.length !== 1) {
  throw new Error('Expected exactly one NightNova portable EXE in release/, found ' + name.length)
}
const file = path.join(dir, name[0])
const contents = await readFile(file)
if (contents.length < 2 || contents[0] !== 0x4d || contents[1] !== 0x5a) {
  throw new Error('Portable EXE does not have a Windows PE signature')
}
const data = {
  product: 'NightNova',
  target: 'windows-x64-portable',
  generatedAt: new Date().toISOString(),
  installed: false,
  dataDirectoryBesideExe: 'NightNova-Data',
  note: 'Hash/inventory only; not a real Windows runtime or signature certificate.',
  files: [{
    name: name[0],
    size: (await stat(file)).size,
    sha256: createHash('sha256').update(contents).digest('hex')
  }]
}
await writeFile(path.join(dir, 'NIGHTNOVA_PORTABLE_MANIFEST.json'),
  JSON.stringify(data, null, 2) + '\n', 'utf8')
console.log('[NightNova Portable] Verified:', data.files[0].name, data.files[0].sha256)
