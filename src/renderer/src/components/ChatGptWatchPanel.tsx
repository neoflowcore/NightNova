import { useEffect, useState } from 'react'
import type { ChatWatchConfig, ChatWatchSnapshot } from '../../../shared/chatgpt-watch'

export function ChatGptWatchPanel({ webContentsId }: { webContentsId: number | null }) {
  const [state, setState] = useState<ChatWatchSnapshot | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  useEffect(() => {
    let mounted = true
    void window.rev.chatWatch.state().then(v => { if (mounted) setState(v) }).catch(e => { if (mounted) setError(String(e)) })
    const off = window.rev.chatWatch.onState(v => { if (mounted) setState(v) })
    return () => { mounted = false; off() }
  }, [])
  const run = async (job: () => Promise<ChatWatchSnapshot>): Promise<void> => {
    setWorking(true); setError('')
    try { setState(await job()) } catch (e) { setError(String(e)) } finally { setWorking(false) }
  }
  const configure = (patch: Partial<ChatWatchConfig>): void => { void run(() => window.rev.chatWatch.configure(patch)) }
  if (!state) return <section className="nightnova-wb-section">ChatGPT 감독 연결 중... {error}</section>
  const config = state.config
  const active = state.status === 'watching'
  const boxes = [
    ['login', '로그인 요청이 나오면 중단'],
    ['approval', '승인 요청이 나오면 중단'],
    ['manualVerification', '수기 검증 요청이 나오면 중단'],
    ['payment', '결제 요청이 나오면 중단']
  ] as const
  return <section className="nightnova-wb-section">
    <h4>ChatGPT 대화 자동 감독 (API 키 불필요)</h4>
    <p className="nightnova-wb-note">현재 열린 ChatGPT 대화를 감독합니다. 체크한 요청에서만 일시정지합니다. 체크하지 않아도 실제 로그인·결제·보안 인증을 완료한 것으로 처리하지 않습니다.</p>
    <div className="nightnova-wb-line">
      <label>재개 판단 간격
        <select disabled={active || working} value={config.intervalMinutes} onChange={e => configure({ intervalMinutes: Number(e.target.value) as 10 | 30 })}>
          <option value={10}>10분</option><option value={30}>30분</option>
        </select>
      </label>
      <label>최대 자동 전송
        <input type="number" min={1} max={24} disabled={active || working} value={config.maxAutoMessages} onChange={e => configure({ maxAutoMessages: Number(e.target.value) })}/>
      </label>
    </div>
    {boxes.map(([key,label]) => <label className="nightnova-wb-check" key={key}>
      <input type="checkbox" disabled={active || working} checked={config.stopOn[key]}
        onChange={e => configure({ stopOn: { ...config.stopOn, [key]: e.target.checked } })}/>
      {label}
    </label>)}
    <label>자동 재개 프롬프트
      <textarea rows={5} disabled={active || working} value={config.resumePrompt}
        onChange={e => setState({ ...state, config: { ...config, resumePrompt: e.target.value } })}/>
    </label>
    <div className="nightnova-wb-line">
      <button type="button" disabled={active || working} onClick={() => configure({ resumePrompt: config.resumePrompt })}>프롬프트 저장</button>
      <button type="button" disabled={active || working || !webContentsId} onClick={() => void run(() => window.rev.chatWatch.start(webContentsId!))}>감독 시작</button>
      <button type="button" disabled={!active || working} onClick={() => void run(() => window.rev.chatWatch.pause())}>일시정지</button>
      <button type="button" disabled={working} onClick={() => void run(() => window.rev.chatWatch.stop())}>종료</button>
    </div>
    <p className="nightnova-wb-note">상태: {state.status} · 자동 전송 {state.sentCount}회 · {state.reason ?? '정상'}</p>
    {error && <p role="alert" className="nightnova-error">{error}</p>}
    <div className="nightnova-log">{state.logs.slice(-8).map((l,i)=><p key={i}>{new Date(l.at).toLocaleTimeString()} · {l.message}</p>)}</div>
  </section>
}
