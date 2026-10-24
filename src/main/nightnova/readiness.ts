import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { detectAgents } from '../acp-detect'
import type { NightnovaDoctor, NightnovaDoctorCheck } from '../../shared/nightnova'
import { resolveWorkspace } from './security'

const exec = promisify(execFile)

async function commandVersion(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(command, args, {
      timeout: 8_000, windowsHide: true, maxBuffer: 16 * 1024,
      shell: process.platform === 'win32' && command.endsWith('.cmd')
    })
    return (stdout || stderr).trim().split(/\r?\n/)[0].slice(0, 160)
  } catch {
    return null
  }
}

function check(id: string, ok: boolean, label: string, detail: string, required = true): NightnovaDoctorCheck {
  return { id, ok, label, detail, required }
}

async function projectScripts(workspace: string): Promise<string[]> {
  try {
    const raw = await readFile(path.join(workspace, 'package.json'), 'utf8')
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return []
    const scripts = (value as { scripts?: unknown }).scripts
    if (!scripts || typeof scripts !== 'object') return []
    return Object.keys(scripts)
      .filter((name) => ['typecheck', 'test', 'build', 'lint', 'check'].includes(name))
  } catch {
    return []
  }
}

export async function runNightnovaDoctor(workspace: string | null): Promise<NightnovaDoctor> {
  const now = Date.now()
  const checks: NightnovaDoctorCheck[] = []
  const [git, node, npm] = await Promise.all([
    commandVersion('git', ['--version']),
    Promise.resolve(process.versions.node),
    commandVersion(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'])
  ])
  checks.push(check('git', !!git, 'Git', git ?? 'Git 실행 파일을 찾지 못함'))
  checks.push(check('node', !!node, 'Node.js', node ?? 'Node 실행 불가'))
  checks.push(check('npm', !!npm, 'npm', npm ?? 'npm 실행 불가', false))
  const agents = await detectAgents([
    { command: 'codex-acp' }, { command: 'claude-agent-acp', fallbackBins: ['claude-code-acp'] }
  ]).catch(() => [])
  const codex = agents.find((a) => a.command === 'codex-acp')
  const claude = agents.find((a) => a.command === 'claude-agent-acp')
  checks.push(check(
    'codex', !!codex?.resolvedPath, 'Codex ACP',
    codex?.resolvedPath ?? 'codex-acp 미설치 (실제 로그인 상태는 실행 시 확인)',
    false
  ))
  checks.push(check(
    'claude', !!claude?.resolvedPath, 'Claude ACP',
    claude?.resolvedPath ?? 'claude-agent-acp 미설치 (선택 사항)', false
  ))
  let validatedWorkspace: string | null = null
  let scripts: string[] = []
  if (workspace) {
    try {
      validatedWorkspace = await resolveWorkspace(workspace)
      checks.push(check('workspace', true, 'Git 작업 폴더', validatedWorkspace))
      scripts = await projectScripts(validatedWorkspace)
      checks.push(check('scripts', scripts.length > 0, '검증 스크립트',
        scripts.length ? scripts.join(', ') : '프로젝트 package.json에 지정된 검사 스크립트 없음', false))
    } catch (error) {
      checks.push(check('workspace', false, 'Git 작업 폴더',
        error instanceof Error ? error.message : String(error)))
    }
  } else {
    checks.push(check('workspace', false, 'Git 작업 폴더', '폴더 선택 필요'))
  }
  return {
    checkedAt: now, platform: process.platform, architecture: process.arch,
    workspace: validatedWorkspace, checks, scripts
  }
}
