/**
 * Auth recovery shared contract.
 * Never expose callback URLs, request bodies, cookies or authentication tokens.
 */
export const OPENAI_LOGIN_ENTRY_URL = 'https://chatgpt.com/auth/login' as const

// Explicit allowlist; never trust *.openai.com or arbitrary *.google.com.
const IDENTITY_HOSTS = new Set([
  'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com'
])

export function isKnownIdentityProviderUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && IDENTITY_HOSTS.has(url.hostname) && !url.port
  } catch {
    return false
  }
}

/** Keep official OpenAI/SSO pages debugger-free during first login and after
 * authentication. The thinking macro uses scoped webview DOM scripts, not CDP. */
export function shouldAvoidAutomaticCdp(value: string): boolean {
  return isOfficialOpenAiLoginUrl(value) || isKnownIdentityProviderUrl(value)
}

/** Login-only pages whose CDP instrumentation can be safely deferred. */
export function isOpenAiAuthenticationFlowUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.port) return false
    if (url.hostname === 'auth.openai.com') return true
    if ((url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com') &&
        /^\/(?:auth|login)(?:\/|$)/i.test(url.pathname)) return true
    return isKnownIdentityProviderUrl(value)
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
    return url.protocol === 'https:' && !url.port && LOGIN_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/** Session permissions for first-party OpenAI sign-in, not carte blanche access. */
export function canGrantOpenAiStorageAccess(
  permission: string, topLevelUrl: string, requestingUrl: string
): boolean {
  if (permission !== 'storage-access' && permission !== 'top-level-storage-access') return false
  const topOfficial = isOfficialOpenAiLoginUrl(topLevelUrl)
  const requestOfficial = isOfficialOpenAiLoginUrl(requestingUrl)
  const topProvider = isKnownIdentityProviderUrl(topLevelUrl)
  const requestProvider = isKnownIdentityProviderUrl(requestingUrl)
  // Only OpenAI <-> known identity provider sign-in or a provider's own frame.
  // No camera, clipboard, notifications, filesystem or generic third-party access.
  return (topOfficial && (requestOfficial || requestProvider)) ||
    (topProvider && requestOfficial) ||
    (topProvider && requestProvider &&
      new URL(topLevelUrl).hostname === new URL(requestingUrl).hostname)
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
