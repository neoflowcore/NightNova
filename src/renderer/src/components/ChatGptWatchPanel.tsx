import { useEffect, useState } from 'react'
import type { Tab } from '@/stores/tabs'
import type { ChatWatchConfig, ChatWatchDashboard } from '../../../shared/chatgpt-watch'

export function ChatGptWatchPanel({ tabs, webContentsId }: { tabs: Tab[]; webContentsId: number | null }) {
  const [state, setState] = useState<ChatWatchDashboard | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [drafts, setDrafts] = useState<Record<number,string>>({})
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
      <label>전환 간격
        <select disabled={working} value={state.rotation.seconds} onChange={e => void run(() => window.rev.chatWatch.rotation({ seconds:Number(e.target.value) as 15|30|60 }))}>
          <option value={15}>15초</option><option value={30}>30초</option><option value={60}>60초</option>
        </select>
      </label>
    </div>
    <h4>프로젝트별 감독</h4>
    {targets.length === 0 && <p className="nightnova-wb-note">ChatGPT에서 기존 프로젝트 대화 탭을 먼저 열어주세요.</p>}
    {targets.map(t => {
      const id = t.webContentsId!
      const snap = state.sessions.find(s => s.webContentsId === id)?.snapshot
      return <div className="nightnova-task" key={t.id}>
        <strong>{t.title || 'ChatGPT'} {id === webContentsId ? '· 보는 중' : ''}</strong>
        <p>{snap?.status ?? '미등록'} · 자동 전송 {snap?.sentCount ?? 0}회</p>
        {snap?.reason && <p>{snap.reason}</p>}
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
      <div className="nightnova-wb-line">
        <label>재개 판단 간격
          <select disabled={active || working} value={config.intervalMinutes}
            onChange={e => configure({intervalMinutes:Number(e.target.value) as 10|30})}>
            <option value={10}>10분</option><option value={30}>30분</option>
          </select>
        </label>
        <label>자동 재개 최대 횟수
          <input type="number" min={1} max={24} disabled={active || working} value={config.maxAutoMessages}
            onChange={e => configure({maxAutoMessages:Number(e.target.value)})}/>
        </label>
      </div>
      {boxes.map(([key,label]) => <label className="nightnova-wb-check" key={key}>
        <input type="checkbox" disabled={active || working} checked={config.stopOn[key]}
          onChange={e => configure({stopOn:{...config.stopOn,[key]:e.target.checked}})}/>
        {label}
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
