import { describe, expect, it } from 'vitest'
import {
  isOfficialOpenAiLoginUrl,
  canGrantOpenAiStorageAccess,
  canGrantChatGptClipboardWrite,
  summarizeOpenAiAuthResponse,
  summarizeOpenAiNetworkError,
  isOpenAiAuthenticationFlowUrl,
  isKnownIdentityProviderUrl,
  shouldAvoidAutomaticCdp,
  appendAuthDiagnostic,
  OPENAI_LOGIN_ENTRY_URL
} from '../shared/auth-support'

describe('OpenAI login compatibility and privacy boundaries', () => {
  it('recognizes only HTTPS official hosts (not lookalike domains)', () => {
    expect(isOfficialOpenAiLoginUrl('https://auth.openai.com/workspace?a=secret')).toBe(true)
    expect(isOfficialOpenAiLoginUrl(OPENAI_LOGIN_ENTRY_URL)).toBe(true)
    expect(isOfficialOpenAiLoginUrl('https://auth.openai.com.evil.example/login')).toBe(false)
    expect(isOfficialOpenAiLoginUrl('http://auth.openai.com/workspace')).toBe(false)
    expect(isOfficialOpenAiLoginUrl('https://accounts.google.com')).toBe(false)
  })
  it('recognizes trusted identity provider hosts without wildcard matching', () => {
    expect(isKnownIdentityProviderUrl('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true)
    expect(isKnownIdentityProviderUrl('https://appleid.apple.com/auth/authorize')).toBe(true)
    expect(isKnownIdentityProviderUrl('https://login.microsoftonline.com/common/oauth2')).toBe(true)
    expect(isKnownIdentityProviderUrl('https://accounts.google.com.evil.test/login')).toBe(false)
    expect(isKnownIdentityProviderUrl('http://accounts.google.com/login')).toBe(false)
    expect(isKnownIdentityProviderUrl('https://google.com/login')).toBe(false)
  })
  it('does not auto-attach a debugger to ChatGPT or identity providers', () => {
    expect(shouldAvoidAutomaticCdp('https://chatgpt.com/')).toBe(true)
    expect(shouldAvoidAutomaticCdp('https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc')).toBe(true)
    expect(shouldAvoidAutomaticCdp('https://auth.openai.com/workspace')).toBe(true)
    expect(shouldAvoidAutomaticCdp('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true)
    expect(shouldAvoidAutomaticCdp('https://example.org/')).toBe(false)
    expect(shouldAvoidAutomaticCdp('https://chatgpt.com.evil.example/')).toBe(false)
  })
  it('allows first-party ChatGPT sanitized clipboard WRITE, never READ', () => {
    const top = 'https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc'
    expect(canGrantChatGptClipboardWrite('clipboard-sanitized-write', top, 'https://chatgpt.com')).toBe(true)
    expect(canGrantChatGptClipboardWrite('clipboard-write', top, 'https://chatgpt.com/c/123')).toBe(true)
    expect(canGrantChatGptClipboardWrite('clipboard-read', top, 'https://chatgpt.com')).toBe(false)
    expect(canGrantChatGptClipboardWrite('deprecated-sync-clipboard-read', top, 'https://chatgpt.com')).toBe(false)
    expect(canGrantChatGptClipboardWrite('clipboard-sanitized-write', top, 'https://auth.openai.com')).toBe(false)
    expect(canGrantChatGptClipboardWrite('clipboard-sanitized-write', top, 'https://chatgpt.com.evil.example')).toBe(false)
    expect(canGrantChatGptClipboardWrite('clipboard-sanitized-write', top, 'http://chatgpt.com')).toBe(false)
    expect(canGrantChatGptClipboardWrite('clipboard-sanitized-write', top, 'https://chatgpt.com:1234')).toBe(false)
    expect(canGrantChatGptClipboardWrite('clipboard-sanitized-write', 'https://evil.example', 'https://chatgpt.com')).toBe(false)
  })
  it('only grants minimal storage permissions to official OpenAI login origins', () => {
    expect(canGrantOpenAiStorageAccess('storage-access',
      'https://chatgpt.com/auth/login', 'https://auth.openai.com/authorize')).toBe(true)
    expect(canGrantOpenAiStorageAccess('top-level-storage-access',
      'https://auth.openai.com/workspace', 'https://chatgpt.com')).toBe(true)
    expect(canGrantOpenAiStorageAccess('storage-access',
      'https://chatgpt.com/auth/login', 'https://accounts.google.com')).toBe(true)
    expect(canGrantOpenAiStorageAccess('storage-access',
      'https://accounts.google.com/o/oauth2', 'https://accounts.google.com')).toBe(true)
    expect(canGrantOpenAiStorageAccess('top-level-storage-access',
      'https://appleid.apple.com/auth', 'https://auth.openai.com')).toBe(true)
    expect(canGrantOpenAiStorageAccess('storage-access',
      'https://chatgpt.com', 'https://accounts.google.com.evil.test')).toBe(false)
    expect(canGrantOpenAiStorageAccess('media',
      'https://chatgpt.com', 'https://auth.openai.com')).toBe(false)
    expect(canGrantOpenAiStorageAccess('storage-access',
      'https://evil.example', 'https://auth.openai.com')).toBe(false)
    expect(canGrantOpenAiStorageAccess('storage-access',
      'https://chatgpt.com', 'https://evil.example')).toBe(false)
  })
  it('classifies HTML received by an API request without exporting tokens', () => {
    const event = summarizeOpenAiAuthResponse({
      url: 'https://auth.openai.com/workspace?code=SECRET&state=PRIVATE',
      statusCode: 200,
      resourceType: 'xhr',
      responseHeaders: { 'Content-Type': ['text/html; charset=utf-8'] }
    }, 1000)
    expect(event).toEqual({
      at: 1000, host: 'auth.openai.com',
      status: 200, contentType: 'text/html', resourceType: 'xhr',
      issue: 'html-api-response'
    })
    expect(JSON.stringify(event)).not.toMatch(/SECRET|PRIVATE|workspace/)
  })
  it('does not retain response bodies, query parameters or request credentials', () => {
    const record = summarizeOpenAiAuthResponse({
      url: 'https://auth.openai.com/authorize?code=PRIVATE_TOKEN#frag',
      statusCode: 502, resourceType: 'xhr', responseHeaders: { 'Content-Type':['text/html'] }
    }, 10)
    const value = JSON.stringify(record)
    expect(value).not.toContain('PRIVATE_TOKEN')
    expect(value).not.toContain('authorize')
    expect(value).not.toContain('frag')
    expect(record?.status).toBe(502)
  })
  it('records failed auth responses without content or request URL', () => {
    expect(summarizeOpenAiAuthResponse({
      url: 'https://chatgpt.com/api/auth/session?token=DO_NOT_COPY',
      statusCode: 403, resourceType: 'xhr',
      responseHeaders: { 'content-type': 'application/json' }
    }, 1234)).toEqual({
      at: 1234, host: 'chatgpt.com', status: 403,
      contentType: 'application/json', resourceType: 'xhr', issue: 'http-error'
    })
  })
  it('recognizes only actual login routes and known identity-provider hosts', () => {
    expect(isOpenAiAuthenticationFlowUrl('https://chatgpt.com/auth/login')).toBe(true)
    expect(isOpenAiAuthenticationFlowUrl('https://auth.openai.com/workspace')).toBe(true)
    expect(isOpenAiAuthenticationFlowUrl('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true)
    expect(isOpenAiAuthenticationFlowUrl('https://appleid.apple.com/auth/authorize')).toBe(true)
    expect(isOpenAiAuthenticationFlowUrl('https://login.microsoftonline.com/common/oauth2')).toBe(true)
    expect(isOpenAiAuthenticationFlowUrl('https://chatgpt.com/c/conversation')).toBe(false)
    expect(isOpenAiAuthenticationFlowUrl('https://accounts.google.com.evil.test')).toBe(false)
  })
  it('keeps only bounded safe diagnostic fields, even after many errors', () => {
    const events = Array.from({length:42},(_,i) => summarizeOpenAiNetworkError({
      url: 'https://auth.openai.com/authorize?token=SECRET' + i, resourceType:'xhr'
    }, i)!).filter(Boolean)
    const bounded = events.reduce<Array<NonNullable<ReturnType<typeof summarizeOpenAiNetworkError>>>>((items, event) => appendAuthDiagnostic(items, event, 24), [])
    expect(bounded.length).toBe(24)
    expect(bounded[0].at).toBe(18)
    expect(JSON.stringify(bounded)).not.toContain('SECRET')
    expect(summarizeOpenAiNetworkError({ url:'https://other.example/private',resourceType:'xhr' },1)).toBeNull()
  })
  it('ignores unrelated and successful ordinary traffic', () => {
    expect(summarizeOpenAiAuthResponse({
      url: 'https://attacker.com/api/', statusCode: 500, resourceType: 'xhr'
    }, 1)).toBeNull()
    expect(summarizeOpenAiAuthResponse({
      url: 'https://auth.openai.com/', statusCode: 200, resourceType: 'mainFrame',
      responseHeaders: { 'content-type': 'text/html' }
    }, 1)).toBeNull()
  })
})
