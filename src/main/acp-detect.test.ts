import { afterEach, describe, expect, it } from 'vitest'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAgentBinary, windowsAgentCandidates } from './acp-detect'

const folders: string[] = []
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true })
})

describe('Windows ACP npm shim detection', () => {
  it('prefers Windows-native launchers; never chooses the extensionless POSIX shim', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nightnova-acp-'))
    folders.push(dir)
    await writeFile(join(dir, 'codex-acp'), '#!/bin/sh\nexec node adapter.js\n')
    await chmod(join(dir, 'codex-acp'), 0o755)
    await writeFile(join(dir, 'codex-acp.ps1'), 'Write-Host NO\n')
    await writeFile(join(dir, 'codex-acp.cmd'), '@ECHO OFF\r\n')
    expect(windowsAgentCandidates('codex-acp')).toEqual([
      'codex-acp.exe', 'codex-acp.cmd', 'codex-acp.bat', 'codex-acp.com'
    ])
    expect(await resolveAgentBinary('codex-acp', [dir], true)).toBe(join(dir, 'codex-acp.cmd'))
    expect(await resolveAgentBinary('codex-acp', [dir], false)).toBe(join(dir, 'codex-acp'))
  })
  it('prefers a real .exe when one exists, and preserves explicitly specified .cmd', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nightnova-acp-'))
    folders.push(dir)
    await writeFile(join(dir, 'codex-acp.exe'), 'fake')
    await writeFile(join(dir, 'codex-acp.cmd'), '@ECHO OFF\r\n')
    expect(await resolveAgentBinary('codex-acp', [dir], true)).toBe(join(dir, 'codex-acp.exe'))
    expect(await resolveAgentBinary('codex-acp.cmd', [dir], true)).toBe(join(dir, 'codex-acp.cmd'))
  })
  it('does not select a PowerShell-only shim or unsuffixed shell script on Windows', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nightnova-acp-'))
    folders.push(dir)
    await writeFile(join(dir, 'codex-acp'), 'echo no')
    await writeFile(join(dir, 'codex-acp.ps1'), 'echo no')
    expect(await resolveAgentBinary('codex-acp', [dir], true)).toBeNull()
  })
})
