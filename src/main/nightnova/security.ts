import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk'
import { isRiskyToolRequest } from '../../shared/risky-tools'
import type { NightnovaPermission } from '../../shared/nightnova'

const exec = promisify(execFile)

export async function resolveWorkspace(candidate: string): Promise<string> {
  if (typeof candidate !== 'string' || !candidate.trim()) throw new Error('작업 폴더를 먼저 선택하세요.')
  const root = await realpath(candidate)
  if (!(await stat(root)).isDirectory()) throw new Error('작업 폴더가 아닙니다.')
  // Avoid unintentionally giving an autonomous agent the entire drive/home.
  if (path.parse(root).root === root) throw new Error('드라이브 루트는 작업 폴더로 사용할 수 없습니다.')
  const { stdout } = await exec('git', ['rev-parse', '--show-toplevel'], {
    cwd: root, timeout: 12_000, maxBuffer: 64 * 1024
  })
  const gitRoot = await realpath(stdout.trim())
  const same = (a: string, b: string): boolean =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
  if (!same(root, gitRoot)) {
    throw new Error('Git 저장소 루트 폴더를 선택해야 합니다. 하위 폴더는 허용하지 않습니다.')
  }
  return root
}

function withinRoot(root: string, input: string): boolean {
  const resolved = path.resolve(root, input)
  const relative = path.relative(root, resolved)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

function safeInputPaths(raw: unknown, workspace: string): boolean {
  if (!raw || typeof raw !== 'object') return true
  const data = raw as Record<string, unknown>
  for (const key of ['path', 'file_path', 'target', 'cwd', 'working_directory', 'directory']) {
    const value = data[key]
    if (typeof value === 'string' && !withinRoot(workspace, value)) return false
  }
  const patch = typeof data.patch === 'string' ? data.patch :
    typeof data.patchText === 'string' ? data.patchText : null
  if (patch) {
    const paths = Array.from(patch.matchAll(/^(?:\*\*\* (?:Add|Update|Delete) File:|\+\+\+ b\/|--- a\/)\s*(.+)$/gm), (m) => m[1].trim())
    if (!paths.length || paths.some((p) => !withinRoot(workspace, p))) return false
  }
  return true
}

// No arbitrary command-line auto-approval. A coding agent may request
// file edits inside an explicitly chosen Git workspace, but shell commands
// remain restricted to simple read-only inspection. Final validation runs via
// fixed presets in main, not through agent-supplied command strings.
function safeReadCommand(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const input = raw as Record<string, unknown>
  const cmd = typeof input.command === 'string' ? input.command.trim() : ''
  if (!cmd || cmd.length > 240 || /[;&|><`$\n\r]/.test(cmd)) return false
  return /^(?:pwd|ls(?:\s+[-\w./]+)*|git\s+(?:status|diff|log|rev-parse)(?:\s+[-\w./]+)*|rg\s+[-\w./ ]+|cat\s+[-\w./]+|find\s+\.\s+-maxdepth\s+\d+)$/.test(cmd)
}

export function nightnovaPermission(
  request: RequestPermissionRequest,
  mode: NightnovaPermission,
  workspace: string
): RequestPermissionResponse {
  const deny = (): RequestPermissionResponse => {
    const reject = request.options.find((option) => option.kind.startsWith('reject'))
    return reject
      ? { outcome: { outcome: 'selected', optionId: reject.optionId } }
      : { outcome: { outcome: 'cancelled' } }
  }
  if (isRiskyToolRequest(request)) return deny()
  const call = (request as unknown as {
    toolCall?: { title?: string; toolCallId?: string; rawInput?: unknown }
  }).toolCall
  const label = `${call?.title ?? ''} ${call?.toolCallId ?? ''}`.toLowerCase()
  const raw = call?.rawInput
  if (!safeInputPaths(raw, workspace)) return deny()
  const isShell = /(?:bash|shell|terminal|execute|exec_command|run_command)/.test(label)
  const isEdit = /(?:apply_patch|patch|edit|write|create_file|delete_file)/.test(label)
  const isRead = /(?:read|view|search|grep|glob|list|file_info|stat|inspect)/.test(label)
  const approved = isShell ? safeReadCommand(raw) :
    isEdit ? mode === 'workspace' :
    isRead
  if (!approved) return deny()
  const allow = request.options.find((option) => option.kind === 'allow_once')
    ?? request.options.find((option) => option.kind.startsWith('allow'))
  return allow
    ? { outcome: { outcome: 'selected', optionId: allow.optionId } }
    : deny()
}
