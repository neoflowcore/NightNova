import { describe, expect, it } from 'vitest'
import {
  isOfficialOpenAiLoginUrl,
  canGrantOpenAiStorageAccess,
  summarizeOpenAiAuthResponse,
  summarizeOpenAiNetworkError,
  isOpenAiAuthenticationFlowUrl,
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
  it('only grants minimal storage permissions to official OpenAI login origins', () => {
    expect(canGrantOpenAiStorageAccess('storage-access',
      'https://chatgpt.com/auth/login', 'https://auth.openai.com/authorize')).toBe(true)
    expect(canGrantOpenAiStorageAccess('top-level-storage-access',
      'https://auth.openai.com/workspace', 'https://chatgpt.com')).toBe(true)
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
    const bounded = events.reduce((items, event) => appendAuthDiagnostic(items,event,24), [])
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
