/**
 * Auth recovery shared contract.
 * Never expose callback URLs, request bodies, cookies or authentication tokens.
 */
export const OPENAI_LOGIN_ENTRY_URL = 'https://chatgpt.com/auth/login' as const

/** Login-only pages whose CDP instrumentation can be safely deferred. */
export function isOpenAiAuthenticationFlowUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    if (url.hostname === 'auth.openai.com') return true
    if ((url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com') &&
        /^\/(?:auth|login)(?:\/|$)/i.test(url.pathname)) return true
    return ['accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com']
      .includes(url.hostname)
  } catch {
    return false
  }
}

const LOGIN_HOSTS = new Set([
  'auth.openai.com', 'chatgpt.com', 'chat.openai.com', 'openai.com'
])

export function isOfficialOpenAiLoginUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && LOGIN_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/** Session permissions for first-party OpenAI sign-in, not carte blanche access. */
export function canGrantOpenAiStorageAccess(
  permission: string, topLevelUrl: string, requestingUrl: string
): boolean {
  return (permission === 'storage-access' || permission === 'top-level-storage-access') &&
    isOfficialOpenAiLoginUrl(topLevelUrl) &&
    isOfficialOpenAiLoginUrl(requestingUrl)
}

export interface AuthNetworkDiagnostic {
  at: number
  host: string
  status: number
  resourceType: string
  contentType: string
  issue: 'http-error' | 'html-api-response' | 'network-error'
}
export interface AuthStatus {
  proxy: 'direct' | 'proxy' | 'unknown'
  failures: AuthNetworkDiagnostic[]
  observedRequests: number
  lastObservedAt: number | null
}

interface NetworkResponseLike {
  url: string
  statusCode: number
  resourceType: string
  responseHeaders?: Record<string, string[] | string | undefined>
}

export function summarizeOpenAiAuthResponse(
  data: NetworkResponseLike, at: number
): AuthNetworkDiagnostic | null {
  if (!isOfficialOpenAiLoginUrl(data.url)) return null
  const headers = data.responseHeaders ?? {}
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type')
  const value = entry?.[1]
  const contentType = (Array.isArray(value) ? value[0] : value ?? '')
    .split(';')[0].trim().toLowerCase().slice(0, 70)
  const status = data.statusCode
  const resourceType = String(data.resourceType).slice(0, 30)
  const statusProblem = Number.isInteger(status) && status >= 400 && status <= 599
  const htmlForApi = /^(xhr|fetch)$/.test(resourceType) && contentType === 'text/html'
  if (!statusProblem && !htmlForApi) return null
  return {
    at, host: new URL(data.url).hostname, status, resourceType, contentType,
    issue: statusProblem ? 'http-error' : 'html-api-response'
  }
}

/** Network failures are represented without raw error strings, URLs or tokens. */
export function summarizeOpenAiNetworkError(
  data: { url: string; resourceType: string }, at: number
): AuthNetworkDiagnostic | null {
  if (!isOfficialOpenAiLoginUrl(data.url)) return null
  return {
    at, host: new URL(data.url).hostname, status: 0,
    resourceType: String(data.resourceType).slice(0,30),
    contentType: '', issue: 'network-error'
  }
}

/** Small ephemeral ring buffer, never persisted in NightNova's profile. */
export function appendAuthDiagnostic(
  previous: readonly AuthNetworkDiagnostic[],
  item: AuthNetworkDiagnostic, limit = 24
): AuthNetworkDiagnostic[] {
  const max = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 24
  return [...previous, item].slice(-max)
}
