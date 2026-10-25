import { useEffect, useState } from 'react'
import type { Tab } from '@/stores/tabs'
import { intervalInputFromSeconds, secondsFromIntervalInput, type ChatWatchConfig, type ChatWatchDashboard, type ChatWatchTimeKind, type ChatWatchTimeUnit } from '../../../shared/chatgpt-watch'

export function ChatGptWatchPanel({ tabs, webContentsId }: { tabs: Tab[]; webContentsId: number | null }) {
  const [state, setState] = useState<ChatWatchDashboard | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [drafts, setDrafts] = useState<Record<number,string>>({})
  const [limitDrafts, setLimitDrafts] = useState<Record<number,string>>({})
  const [intervalEdits, setIntervalEdits] = useState<Record<string, { amount: number; unit: ChatWatchTimeUnit }>>({})
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
  const targets = tabs.filter(t => t.webContentsId && /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)\/c\/[-\w]{12,}/.test(t.url))
  const current = state.sessions.find(s => s.webContentsId === webContentsId)
  const config = current?.snapshot.config
  const active = current?.snapshot.status === 'watching'
  const configure = (patch: Partial<ChatWatchConfig>): void => {
    if (!webContentsId) return
    void run(() => window.rev.chatWatch.configure(webContentsId, patch))
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
  return <section className="nightnova-wb-section">
    <h4>NightNova · 생각하는 매크로</h4>
    <p className="nightnova-wb-note">감독 중인 ChatGPT 프로젝트를 자동으로 화면에 순환 표시합니다. 사용자가 직접 다른 탭을 선택할 수도 있습니다. 프로젝트마다 진행 상태와 재개 조건은 독립적입니다.</p>
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
        <strong>{t.title || 'ChatGPT'} {id === webContentsId ? '· 보는 중' : ''}</strong>
        <p>{snap?.status ?? '미등록'} · 자동 전송 {snap?.sentCount ?? 0}회</p>
        {snap?.reason && <p>{snap.reason}</p>}
        {snap?.page && <p className="nightnova-wb-note">마지막 메시지: {snap.page.lastMessageRole === "user" ? "사용자 · 답변 대기" : snap.page.lastMessageRole === "assistant" ? "AI 응답" : "판독 중"} · {snap.page.generating ? "생성 중" : "생성 표시 없음"} · {snap.page.hasDraft ? "미전송 초안 있음" : "초안 없음"}</p>}
        {snap?.lastDecision && <p role="status" className="nightnova-wb-note">판단: {snap.lastDecision.reason}</p>}
        <div className="nightnova-wb-line">
          <button disabled={working || snap?.status === 'watching'} onClick={() => void run(() => window.rev.chatWatch.start(id))}>시작</button>
          <button disabled={working || snap?.status !== 'watching'} onClick={() => void run(() => window.rev.chatWatch.pause(id))}>일시정지</button>
          <button disabled={working} onClick={() => void run(() => window.rev.chatWatch.inspect(id))}>상태 확인</button>
        </div>
      </div>
    })}
    <div className="nightnova-wb-line">
      <button disabled={working || !targets.length} onClick={() => void run(() => window.rev.chatWatch.startMany(targets.map(t => t.webContentsId!)))}>모든 대화 감독 시작</button>
      <button disabled={working} onClick={() => void run(() => window.rev.chatWatch.pauseAll())}>모두 일시정지</button>
      <button disabled={working} onClick={() => void run(() => window.rev.chatWatch.stopAll())}>모두 종료</button>
    </div>
    <h4>현재 선택한 탭 설정</h4>
    {!config ? <p className="nightnova-wb-note">먼저 이 탭에서 감독 시작을 눌러주세요.</p> : <>
      {timeField('자동 재개 판단 간격', 'resume-' + webContentsId, config.intervalSeconds, 'resume',
        value => configure({intervalSeconds:value}), active)}
      {timeField('상태 점검 간격', 'check-' + webContentsId, config.checkIntervalSeconds, 'check',
        value => configure({checkIntervalSeconds:value}), active)}
      <div className="nightnova-wb-line">
        <label>자동 재개 최대 횟수
          <input type="number" min={1} max={24} step={1} disabled={active || working}
            value={limitDrafts[webContentsId!] ?? String(config.maxAutoMessages)}
            onChange={e => setLimitDrafts(prev => ({ ...prev, [webContentsId!]: e.target.value }))}/>
        </label>
        <button type="button" disabled={active || working} onClick={() => {
          const count = Number(limitDrafts[webContentsId!] ?? String(config.maxAutoMessages))
          if (!Number.isSafeInteger(count) || count < 1 || count > 24) {
            setError('자동 재개 최대 횟수는 1~24의 정수여야 합니다.')
            return
          }
          setLimitDrafts(prev => { const next = { ...prev }; delete next[webContentsId!]; return next })
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
          value={drafts[webContentsId!] ?? config.resumePrompt}
          onChange={e => setDrafts(prev=>({...prev,[webContentsId!]:e.target.value}))}/>
      </label>
      <button disabled={active || working} onClick={() => configure({resumePrompt:drafts[webContentsId!] ?? config.resumePrompt})}>프롬프트 저장</button>
    </>}
    {state.errors.map((e,i)=><p className="nightnova-error" key={i}>{e}</p>)}
    {error && <p role="alert" className="nightnova-error">{error}</p>}
    <div className="nightnova-log">{state.sessions.flatMap(s=>s.snapshot.logs.slice(-2).map(l=>({ ...l, id:s.webContentsId }))).slice(-12).map((l,i)=><p key={i}>탭 {l.id} · {new Date(l.at).toLocaleTimeString()} · {l.message}</p>)}</div>
  </section>
}
