import { useEffect, useState } from 'react'
import { useTabsStore, type Tab } from '@/stores/tabs'
import { isSupportedChatGptConversationUrl, intervalInputFromSeconds, secondsFromIntervalInput, chatWatchIdleCountdown, formatWatchDuration, type ChatWatchConfig, type ChatWatchDashboard, type ChatWatchTimeKind, type ChatWatchTimeUnit } from '../../../shared/chatgpt-watch'

export function ChatGptWatchPanel({ tabs, webContentsId }: { tabs: Tab[]; webContentsId: number | null }) {
  const [state, setState] = useState<ChatWatchDashboard | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const [settingsTab, setSettingsTab] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number,string>>({})
  const [limitDrafts, setLimitDrafts] = useState<Record<number,string>>({})
  const [intervalEdits, setIntervalEdits] = useState<Record<string, { amount: number; unit: ChatWatchTimeUnit }>>({})
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    let mounted = true
    void window.rev.chatWatch.state().then(v => { if (mounted) setState(v) }).catch(e => { if (mounted) setError(String(e)) })
    const off = window.rev.chatWatch.onState(v => { if (mounted) setState(v) })
    return () => { mounted = false; off() }
  }, [])
  const run = async (job: () => Promise<ChatWatchDashboard>): Promise<void> => {
    setWorking(true); setError('')
    try { setState(await job()) } catch (e) { setError(String(e)) } finally { setWorking(false) }
  }
  if (!state) return <section className="nightnova-wb-section">ChatGPT 감독 연결 중... {error}</section>
  const targets = tabs.filter(t => t.webContentsId && isSupportedChatGptConversationUrl(t.url))
  const settingsId = settingsTab && targets.some(t => t.webContentsId === settingsTab)
    ? settingsTab : targets.some(t => t.webContentsId === webContentsId)
      ? webContentsId : targets[0]?.webContentsId ?? null
  const current = state.sessions.find(s => s.webContentsId === settingsId)
  const config = current?.snapshot.config
  const active = current?.snapshot.status === 'watching'
  const watching = state.sessions.filter(s => s.snapshot.status === 'watching').length
  const human = state.sessions.filter(s => s.snapshot.status === 'needs-human').length
  const completed = state.sessions.filter(s => s.snapshot.status === 'completed').length
  const configure = (patch: Partial<ChatWatchConfig>): void => {
    if (!settingsId) return
    void run(() => window.rev.chatWatch.configure(settingsId, patch))
  }
  const timeField = (label: string, key: string, seconds: number, kind: ChatWatchTimeKind, apply: (value:number)=>void, disabled = false) => {
    const draft = intervalEdits[key] ?? intervalInputFromSeconds(seconds)
    return <div className="nightnova-wb-line" key={key}>
      <label>{label}
        <input type="number" min={0.0001} step="any" disabled={disabled || working} value={draft.amount}
          onChange={e => setIntervalEdits(prev => ({ ...prev, [key]: { ...draft, amount: Number(e.target.value) } }))}/>
      </label>
      <select aria-label={label + ' 단위'} disabled={disabled || working} value={draft.unit}
        onChange={e => setIntervalEdits(prev => ({ ...prev, [key]: { ...draft, unit: e.target.value as ChatWatchTimeUnit } }))}>
        <option value="seconds">초</option><option value="minutes">분</option><option value="hours">시간</option><option value="days">일</option>
      </select>
      <button type="button" disabled={disabled || working} onClick={() => {
        const value = secondsFromIntervalInput(draft.amount, draft.unit)
        const min = kind === 'resume' ? 15 : 5
        const max = kind === 'resume' ? 604800 : 86400
        if (!Number.isSafeInteger(value) || value < min || value > max) {
          setError(label + '은 ' + min + '~' + max + '초 범위로 설정하세요.')
          return
        }
        setIntervalEdits(prev => { const next = {...prev}; delete next[key]; return next })
        apply(value)
      }}>적용</button>
    </div>
  }
  const boxes = [
    ['login', '로그인 요청에서 중단'],
    ['approval', '승인 요청에서 중단'],
    ['manualVerification', '수기 검증 요청에서 중단'],
    ['payment', '결제 요청에서 중단']
  ] as const
  const emergencyStop = (): void => {
    // Never disable Stop just because another request is saving settings.
    void window.rev.chatWatch.stopAll().then(setState).catch(e => setError(String(e)))
  }
  return <section className="nightnova-wb-section">
    <h4>NightNova · 생각하는 매크로</h4>
    <p className="nightnova-wb-note">긴급 중단 단축키: <strong>Alt+Shift+X</strong> · ChatGPT 탭에서 입력 중이어도 동작합니다.</p>
    <p className="nightnova-wb-note" role="status">
      감독 중 {watching}개 · 완료 {completed}개 · 직접 확인 {human}개 · 등록 {state.sessions.length}개 (최대 8개)
    </p>
    <p className="nightnova-wb-note">감독 중인 ChatGPT 프로젝트를 실제 브라우저 화면에 순환 표시합니다. 사용자가 입력·클릭하는 동안에는 자동 화면 전환을 잠시 보류하며, 탭마다 감독 상태와 재개 조건은 독립적입니다.</p>
    <div className="nightnova-wb-line">
      <label className="nightnova-wb-check">
        <input type="checkbox" checked={state.rotation.enabled} disabled={working}
          onChange={e => void run(() => window.rev.chatWatch.rotation({ enabled:e.target.checked }))}/>
        작업 탭 자동 화면 순환
      </label>

    </div>
    {timeField('화면 자동 순환 간격', 'rotation', state.rotation.intervalSeconds, 'rotation',
      value => void run(() => window.rev.chatWatch.rotation({intervalSeconds:value})))}
    <p className="nightnova-wb-note">초·분·시간·일을 직접 입력하세요. 상태 점검 간격이 길면 재개 판단도 늦어집니다. 자동 명령은 화면에 표시되는 탭에서만 전송합니다.</p>
    <h4>프로젝트별 감독</h4>
    {targets.length === 0 && <p className="nightnova-wb-note">ChatGPT에서 기존 프로젝트 대화 탭을 먼저 열어주세요.</p>}
    {targets.map(t => {
      const id = t.webContentsId!
      const snap = state.sessions.find(s => s.webContentsId === id)?.snapshot
      return <div className="nightnova-task" key={t.id}>
        <strong>{t.title || 'ChatGPT'} {id === webContentsId ? '· 보는 중' : ''} {id === settingsId ? '· 설정 대상' : ''}</strong>
        <p>{snap?.status === 'completed' ? '작업 완료' : snap?.status ?? '미등록'} · 자동 전송 {snap?.sentCount ?? 0}/{snap?.config.maxAutoMessages ?? 12}회 · 시도 {snap?.attemptCount ?? 0}회</p>
        {snap?.reason && <p>{snap.reason}</p>}
        {snap?.page && <p className="nightnova-wb-note">마지막 메시지: {snap.page.lastMessageRole === "user" ? "사용자 · 답변 대기" : snap.page.lastMessageRole === "assistant" ? "AI 응답" : "판독 중"} · {snap.page.generating ? "생성 중" : "생성 표시 없음"} · {snap.page.hasDraft ? "미전송 초안 있음" : "초안 없음"}</p>}
        {snap?.lastDecision && <p role="status" className="nightnova-wb-note">판단: {snap.lastDecision.reason}</p>}
        {snap?.lastProgressAt && <p className="nightnova-wb-note">마지막 진행: {new Date(snap.lastProgressAt).toLocaleTimeString()} · 최근 검사: {snap.lastCheckAt ? new Date(snap.lastCheckAt).toLocaleTimeString() : '없음'}</p>}
        {snap?.status === 'watching' && (() => {
          const countdown = chatWatchIdleCountdown(clock, snap.lastProgressAt, snap.config.intervalSeconds)
          return <div className="nightnova-watch-timer" aria-label="다음 재개 판단까지 최소 대기">
            <span>최소 대기 {formatWatchDuration(countdown.remainingSeconds)} · {countdown.progressPercent}%</span>
            <div className="nightnova-watch-timer-track"><div style={{ width: countdown.progressPercent + '%' }}/></div>
            <small>시간이 끝나도 AI 생성 중이거나 사용자 입력이 있으면 자동 전송하지 않습니다.</small>
          </div>
        })()}
        <div className="nightnova-wb-line">
          <button type="button" onClick={() => useTabsStore.getState().selectTab(t.id)}>탭 보기</button>
          <button type="button" onClick={() => setSettingsTab(id)}>설정 선택</button>
          <button disabled={working || snap?.status === 'watching'} onClick={() => void run(() => window.rev.chatWatch.configure(id, {}))}>설정 준비</button>
          <button disabled={working || snap?.status === 'watching'} onClick={() => void run(() => window.rev.chatWatch.start(id))}>시작</button>
          <button disabled={working || snap?.status !== 'watching'} onClick={() => void run(() => window.rev.chatWatch.pause(id))}>일시정지</button>
          <button disabled={working} onClick={() => void run(() => window.rev.chatWatch.inspect(id))}>상태 확인</button>
          <button disabled={working || snap?.status !== 'watching'} onClick={() => void run(() => window.rev.chatWatch.checkNow(id))}>지금 판단</button>
          <button disabled={working || !snap || snap.status === 'off'} onClick={() => void run(() => window.rev.chatWatch.stop(id))}>종료</button>
        </div>
      </div>
    })}
    <div className="nightnova-wb-line">
      <button disabled={working || !targets.length} onClick={() => void run(() => window.rev.chatWatch.startMany(targets.map(t => t.webContentsId!)))}>모든 대화 감독 시작</button>
      <button type="button" onClick={() => { void window.rev.chatWatch.pauseAll().then(setState).catch(e => setError(String(e))) }}>모두 일시정지</button>
      <button type="button" onClick={emergencyStop} title="다른 작업 도중에도 즉시 중단합니다">■ 모두 긴급 종료</button>
    </div>
    <h4>감독 대상별 설정</h4>
    <label>설정 대상
      <select value={settingsId ?? ''} onChange={e => setSettingsTab(Number(e.target.value))}>
        {targets.map(t => <option key={t.id} value={t.webContentsId!}>{t.title || t.url.slice(0, 50)}</option>)}
      </select>
    </label>
    <p className="nightnova-wb-note">감독할 탭을 여기서 선택하면 브라우저 화면을 전환하지 않고도 설정을 편집할 수 있습니다.</p>
    {!config ? <p className="nightnova-wb-note">이 탭에서 설정 준비를 누르면 감독 시작 전에 시간과 재개 프롬프트를 편집할 수 있습니다.</p> : <>
      {timeField('자동 재개 판단 간격', 'resume-' + settingsId, config.intervalSeconds, 'resume',
        value => configure({intervalSeconds:value}), active)}
      {timeField('상태 점검 간격', 'check-' + settingsId, config.checkIntervalSeconds, 'check',
        value => configure({checkIntervalSeconds:value}), active)}
      <div className="nightnova-wb-line">
        <label>자동 재개 최대 횟수
          <input type="number" min={1} max={24} step={1} disabled={active || working}
            value={limitDrafts[settingsId!] ?? String(config.maxAutoMessages)}
            onChange={e => setLimitDrafts(prev => ({ ...prev, [settingsId!]: e.target.value }))}/>
        </label>
        <button type="button" disabled={active || working} onClick={() => {
          const count = Number(limitDrafts[settingsId!] ?? String(config.maxAutoMessages))
          if (!Number.isSafeInteger(count) || count < 1 || count > 24) {
            setError('자동 재개 최대 횟수는 1~24의 정수여야 합니다.')
            return
          }
          setLimitDrafts(prev => { const next = { ...prev }; delete next[settingsId!]; return next })
          configure({maxAutoMessages: count})
        }}>적용</button>
      </div>
      {boxes.map(([key,label]) => <label className="nightnova-wb-check" key={key}>
        <input type="checkbox" disabled={active || working || key === "payment"} checked={key === "payment" ? true : config.stopOn[key]}
          onChange={e => configure({stopOn:{...config.stopOn,[key]:e.target.checked}})}/>
        {label}{key === "payment" ? " · 안전상 항상 적용" : ""}
      </label>)}
      <label>재개 프롬프트
        <textarea rows={5} disabled={active || working}
          value={drafts[settingsId!] ?? config.resumePrompt}
          onChange={e => setDrafts(prev=>({...prev,[settingsId!]:e.target.value}))}/>
      </label>
      <button disabled={active || working} onClick={() => configure({resumePrompt:drafts[settingsId!] ?? config.resumePrompt})}>프롬프트 저장</button>
    </>}
    {state.errors.map((e,i)=><p className="nightnova-error" key={i}>{e}</p>)}
    {error && <p role="alert" className="nightnova-error">{error}</p>}
    <button type="button" onClick={() => {
      const data = {
        product: 'NightNova', exportedAt: new Date().toISOString(),
        sessions: state.sessions.map(s => ({
          tabId: s.webContentsId,
          status: s.snapshot.status,
          lastCheckAt: s.snapshot.lastCheckAt,
          lastProgressAt: s.snapshot.lastProgressAt,
          sentCount: s.snapshot.sentCount,
          attemptCount: s.snapshot.attemptCount,
          lastDecision: s.snapshot.lastDecision,
          logs: s.snapshot.logs
        }))
      }
      void navigator.clipboard.writeText(JSON.stringify(data, null, 2))
        .then(() => setError('감독 진단 기록을 클립보드에 복사했습니다. 대화 본문과 로그인 정보는 포함하지 않습니다.'))
        .catch(e => setError('진단 기록 복사 실패: ' + String(e)))
    }}>진단 기록 복사 (대화 본문 제외)</button>
    <div className="nightnova-log">{state.sessions.flatMap(s=>s.snapshot.logs.slice(-2).map(l=>({ ...l, id:s.webContentsId }))).slice(-12).map((l,i)=><p key={i}>탭 {l.id} · {new Date(l.at).toLocaleTimeString()} · {l.message}</p>)}</div>
  </section>
}
