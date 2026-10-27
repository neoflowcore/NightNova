import { CHAT_WATCH_COMPLETION_MARKER, isSupportedChatGptConversationUrl, type ChatWatchDomObservation, type ChatWatchStopConditions } from '../../shared/chatgpt-watch'

export function isChatGptConversation(url: string): boolean {
  return isSupportedChatGptConversationUrl(url)
}

export function sameConversation(a: string, b: string): boolean {
  try {
    const first = new URL(a)
    const second = new URL(b)
    return first.hostname === second.hostname &&
      first.protocol === second.protocol &&
      first.pathname.replace(/\/$/, '') === second.pathname.replace(/\/$/, '')
  } catch {
    return false
  }
}

export type ChatWatchActionCategory = keyof ChatWatchStopConditions

/**
 * Detect concrete requests for the operator, not ordinary mentions of
 * "login" or "manual tests" in code comments. An unchecked box only disables
 * pausing on the request text; it never fabricates approval or test results.
 */
export function detectChatWatchActionRequests(text: string): ChatWatchActionCategory[] {
  const tail = text.slice(-2700)
  const wanted: ChatWatchActionCategory[] = []
  const add = (category: ChatWatchActionCategory, matched: boolean): void => {
    if (matched) wanted.push(category)
  }
  add('payment',
    /(?:결제|구매|유료\s*결제|과금\s*승인).{0,52}(?:필요|진행|완료|해\s*주|승인|요청)/i.test(tail) ||
    /(?:pay|purchase|payment|billing).{0,55}(?:approve|confirm|required|needed|complete)/i.test(tail))
  add('login',
    /(?:로그인|인증|2단계\s*인증|계정\s*연결).{0,60}(?:필요|해\s*주|해\s*야|진행|요청)/i.test(tail) ||
    /(?:please|you\s+need\s+to|requires?)\s+(?:manually\s+)?(?:log\s*in|sign\s*in|authenticate)/i.test(tail))
  add('approval',
    /(?:권한\s*승인|접속\s*승인|배포\s*승인|사용자\s*승인|승인\s*버튼|허가).{0,52}(?:필요|해\s*주|해\s*야|진행|요청)/i.test(tail) ||
    /(?:please|you\s+need\s+to|requires?)\s+(?:manually\s+)?(?:approve|grant\s+permission)/i.test(tail))
  add('manualVerification',
    /(?:수기|수동|직접|실기).{0,12}(?:검증|점검|확인|테스트|조작|실행).{0,55}(?:필요|해\s*주|해\s*야|진행|요청)/i.test(tail) ||
    /(?:manual|human)\s+(?:verification|approval\s+review|test|testing|intervention|review)\s+(?:is\s+)?(?:required|needed)/i.test(tail))
  return wanted
}

export function requestedChatWatchPause(
  text: string,
  stopOn: ChatWatchStopConditions
): ChatWatchActionCategory | null {
  // Payment always requires a human, including upgraded legacy preferences.
  return detectChatWatchActionRequests(text).find((category) => category === 'payment' || stopOn[category]) ?? null
}

export type WatchDecision =
  | { type: 'wait'; reason: string }
  | { type: 'send'; reason: string }
  | { type: 'needs-human'; reason: string }
  | { type: 'complete'; reason: string }

/** Only an exact standalone final line is a trustworthy terminal hint. */
export function hasExplicitChatWatchCompletion(text: string): boolean {
  const last = text.trimEnd()
  return last.endsWith(CHAT_WATCH_COMPLETION_MARKER) &&
    (last === CHAT_WATCH_COMPLETION_MARKER ||
      last.charAt(last.length - CHAT_WATCH_COMPLETION_MARKER.length - 1) === '\n')
}

export interface WatchDecisionContext {
  now: number
  lastProgressAt: number
  intervalSeconds: number
  sentCount: number
  maxAutoMessages: number
  awaitingResponse: boolean
  stableObservations: number
  stopOn: ChatWatchStopConditions
  /** Unknown/missing roles may be monitored without authorizing Send. */
  readOnly?: boolean
}

export function decideChatWatch(
  page: ChatWatchDomObservation,
  ctx: WatchDecisionContext
): WatchDecision {
  const age = Math.max(0, ctx.now - ctx.lastProgressAt)
  const threshold = ctx.intervalSeconds * 1000
  const generationStallThreshold = Math.max(30 * 60 * 1000, threshold * 3)
  if (!isChatGptConversation(page.url)) return { type: 'needs-human', reason: 'ChatGPT 대화 주소가 아닙니다.' }
  if (page.needsLogin || page.challenge) {
    return { type: 'needs-human', reason: 'ChatGPT 로그인 또는 사용자 인증이 필요합니다.' }
  }
  if (!page.generating) {
    const category = requestedChatWatchPause(page.lastAssistantText, ctx.stopOn)
    if (category) {
      const labels: Record<ChatWatchActionCategory, string> = {
        login: '로그인 요청',
        approval: '승인 요청',
        manualVerification: '수기 검증 요청',
        payment: '결제 요청'
      }
      return { type: 'needs-human', reason: '안전 중단 조건에 도달했습니다: ' + labels[category] }
    }
  }
  if (!page.online) return ctx.readOnly
    ? { type: 'wait', reason: '모의실행: 오프라인 상태에서 연결 복구를 기다립니다. 실제 메시지는 보내지 않습니다.' }
    : { type: 'needs-human', reason: '네트워크가 오프라인입니다. 자동 전송을 중단하고 연결 상태를 확인하세요.' }
  if (page.connectionProblem) return ctx.readOnly
    ? { type: 'wait', reason: '모의실행: ChatGPT 연결 해제 알림이 표시되어 전송 없이 상태를 관찰합니다.' }
    : { type: 'needs-human', reason: 'ChatGPT 화면에 연결 해제 오류가 표시되었습니다. 중복 전송 위험 때문에 멈춥니다.' }
  if (!page.assistantCount) return ctx.readOnly
    ? { type: 'wait', reason: '모의실행: ChatGPT 응답 DOM 구조를 아직 인식하지 못했습니다. 전송은 차단한 채 다시 검사합니다.' }
    : { type: 'needs-human', reason: '기존 ChatGPT 응답이 없습니다. 먼저 직접 대화를 시작해야 합니다.' }
  if (page.generating) {
    // Extended reasoning is not a completed idle response; never submit while generating.
    return age >= generationStallThreshold
      ? { type: 'needs-human', reason: '응답 생성 중 30분 이상(또는 재개 간격의 3배) 변화가 없어 점검이 필요합니다.' }
      : { type: 'wait', reason: 'ChatGPT가 응답 생성 중입니다. 완료될 때까지 재개 프롬프트를 보내지 않습니다.' }
  }
  if (page.lastMessageRole === 'user') {
    return age >= threshold
      ? { type: 'needs-human', reason: '최근 사용자 메시지의 답변을 확인하지 못했습니다. 중복 전송 방지를 위해 중단합니다.' }
      : { type: 'wait', reason: '마지막 메시지가 사용자 요청입니다. 답변을 기다립니다.' }
  }
  if (page.lastMessageRole !== 'assistant') {
    return ctx.readOnly
      ? { type: 'wait', reason: '모의실행: 마지막 메시지 역할을 확정하지 못했습니다. 실제 전송 없이 계속 관찰합니다.' }
      : { type: 'needs-human', reason: '마지막 메시지 역할 판독 실패. 실제 자동 전송은 차단합니다.' }
  }
  if (ctx.awaitingResponse) {
    return age >= threshold
      ? { type: 'needs-human', reason: '이전 자동 프롬프트의 답변을 확인하지 못했습니다. 중복 전송 방지를 위해 중단합니다.' }
      : { type: 'wait', reason: '직전 자동 프롬프트에 대한 응답을 기다립니다.' }
  }
  if (hasExplicitChatWatchCompletion(page.lastAssistantText)) {
    return { type: 'complete', reason: 'NightNova 완료 신호를 확인했습니다. 감독을 자동 종료합니다.' }
  }
  if (!page.composerReady) {
    return ctx.readOnly
      ? { type: 'wait', reason: '모의실행: 입력창이 준비되지 않았습니다. 복구될 때까지 전송 없이 관찰합니다.' }
      : { type: 'needs-human', reason: 'ChatGPT 입력창을 찾을 수 없습니다. 웹페이지 변경 또는 계정 상태 확인이 필요합니다.' }
  }
  if (page.hasDraft) return ctx.readOnly
    ? { type: 'wait', reason: '모의실행: 미전송 초안이 있어 건드리지 않고 관찰합니다.' }
    : { type: 'needs-human', reason: '사용자가 작성한 미전송 메시지가 있습니다. 덮어쓰지 않습니다.' }
  if (ctx.sentCount >= ctx.maxAutoMessages) {
    return { type: 'needs-human', reason: '설정한 최대 자동 프롬프트 횟수에 도달했습니다.' }
  }
  if (ctx.stableObservations < 2 || age < threshold) {
    return { type: 'wait', reason: '대화의 마지막 진행 이후 재개 판단 시각을 기다립니다.' }
  }
  return { type: 'send', reason: 'ChatGPT가 종료된 답변 상태로 설정 시간 동안 진행되지 않았습니다.' }
}
