import { useEffect, useState, type FormEvent } from 'react'
import type { NightnovaConfig, NightnovaSnapshot, NightnovaTaskTemplate, NightnovaReview } from '../../../shared/nightnova'
import { nightnovaProgress, isNightnovaBusy } from '../../../shared/nightnova'

function fmt(when: number | null): string {
  return when ? new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(when) : '-'
}

function until(ms: number): string {
  if (ms <= 0) return '마감'
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor(sec % 3600 / 60)
  const s = sec % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

function toLocalInput(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
    pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function defaultDeadline(): string {
  const now = new Date()
  const next = new Date(now)
  next.setHours(10, 0, 0, 0)
  if (next.getTime() - now.getTime() < 360_000) next.setDate(next.getDate() + 1)
  return toLocalInput(next.getTime())
}

export function NightnovaWorkbench() {
  const [state, setState] = useState<NightnovaSnapshot | null>(null)
  const [input, setInput] = useState('')
  const [bulkInput, setBulkInput] = useState('')
  const [expectChanges, setExpectChanges] = useState(true)
  const [templateId, setTemplateId] = useState('')
  const [templates, setTemplates] = useState<NightnovaTaskTemplate[]>([])
  const [deadline, setDeadline] = useState(defaultDeadline)
  const [clock, setClock] = useState(Date.now)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [review, setReview] = useState<NightnovaReview|null>(null)
  const [bundleTitle, setBundleTitle] = useState('')
  const [editingId, setEditingId] = useState<string|null>(null)
  const [editText, setEditText] = useState('')
  useEffect(() => {
    let live = true
    void window.rev.nightnova.state().then((snapshot) => {
      if (!live) return
      setState(snapshot)
      if (snapshot.config.deadlineAt) setDeadline(toLocalInput(snapshot.config.deadlineAt))
    }).catch((e) => { if (live) setError(String(e)) })
    void window.rev.nightnova.templates().then((items) => {
      if (live) setTemplates(items)
    }).catch(() => { /* The task UI stays usable when templates are unavailable. */ })
    const off = window.rev.nightnova.onState((snapshot) => { if (live) setState(snapshot) })
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => { live = false; off(); clearInterval(timer) }
  }, [])

  const action = async (fn: () => Promise<NightnovaSnapshot>): Promise<void> => {
    setError('')
    setWorking(true)
    try { setState(await fn()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setWorking(false) }
  }

  const change = (patch: Partial<NightnovaConfig>): void => {
    void action(() => window.rev.nightnova.configure(patch))
  }

  const onAdd = (event: FormEvent): void => {
    event.preventDefault()
    const text = input.trim()
    if (!text) return
    void action(async () => {
      const next = await window.rev.nightnova.enqueue(text, expectChanges)
      setInput('')
      return next
    })
  }

  const addBulk = (): void => {
    const parts = bulkInput.trim().split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean)
    if (parts.length === 0) return
    if (parts.some((part) => part.length > 4000)) {
      setError('개별 작업은 4,000자 이하로 작성하세요.')
      return
    }
    void action(async () => {
      const next = await window.rev.nightnova.enqueueMany(
        parts.map((instruction) => ({ instruction, expectChanges }))
      )
      setBulkInput('')
      return next
    })
  }

  const start = (): void => {
    const timestamp = new Date(deadline).getTime()
    if (!Number.isFinite(timestamp)) { setError('종료 날짜와 시각을 지정하세요.'); return }
    void action(async () => {
      await window.rev.nightnova.configure({ deadlineAt: timestamp })
      return window.rev.nightnova.start()
    })
  }

  if (!state) return <div className="nightnova-workbench">NightNova 개발 작업창 연결 중...</div>
  const active = isNightnovaBusy(state.status)
  const config = state.config
  const percent = nightnovaProgress(state)
  const done = state.tasks.filter((task) => task.status === 'done').length
  const timeLeft = config.deadlineAt ? config.deadlineAt - clock : 0

  return (
    <div className="nightnova-workbench">
      <div className="nightnova-wb-head">
        <strong>☾ ✦ NightNova 개발 자동화</strong>
        <span className="nightnova-state">{state.status}</span>
      </div>
      <div className="nightnova-wb-scroll" data-stable-scroll>
        <section className="nightnova-wb-section">
          <div className="nightnova-metrics">
            <div><small>작업 완료</small><strong>{percent}%</strong><span>{done}/{state.tasks.length}</span></div>
            <div><small>ACP 턴</small><strong>{state.turns}/{config.maxTurns}</strong><span>재시도 최대 {config.maxRetries}</span></div>
            <div><small>남은 시간</small><strong>{config.deadlineAt ? until(timeLeft) : '미설정'}</strong><span>{fmt(config.deadlineAt)}</span></div>
          </div>
          <div className="nightnova-progress"><div style={{ width: percent + '%' }} /></div>
        </section>
        <section className="nightnova-wb-section">
          <h4>1. 로컬 개발 환경</h4>
          <div className="nightnova-wb-line">
            <button type="button" disabled={active || working} onClick={() => void action(() => window.rev.nightnova.chooseWorkspace())}>
              Git 폴더 선택
            </button>
            <button type="button" disabled={active || working || !config.workspace} onClick={() => void action(() => window.rev.nightnova.git())}>Git 확인</button>
            <button
              type="button"
              disabled={working}
              onClick={() => {
                setError('')
                setWorking(true)
                void window.rev.nightnova.doctor()
                  .then(() => window.rev.nightnova.state())
                  .then((snapshot) => setState(snapshot))
                  .catch((error) => setError(String(error)))
                  .finally(() => setWorking(false))
              }}
            >환경 점검</button>
          </div>
          <div className="nightnova-path" title={config.workspace ?? ''}>{config.workspace ?? '작업 폴더를 선택하지 않았습니다.'}</div>
          {state.doctor && (
            <details className="nightnova-doctor">
              <summary>실행 환경: {state.doctor.checks.filter((item) => item.ok).length}/{state.doctor.checks.length} 항목 확인</summary>
              {state.doctor.checks.map((item) => (
                <div className="nightnova-doctor-item" key={item.id}>
                  <strong>{item.ok ? '✓' : item.required ? '✕' : '–'} {item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
              <p className="nightnova-wb-note">실행 파일 확인은 로그인 성공을 보증하지 않습니다. 실제 ACP 세션은 개발 시작 시 연결합니다.</p>
            </details>
          )}
          <label>에이전트
            <select disabled={active || working} value={config.agent} onChange={(e) => change({ agent: e.target.value as NightnovaConfig['agent'] })}>
              <option value="codex">Codex ACP (우선)</option>
              <option value="claude-code">Claude Code ACP</option>
            </select>
          </label>
          <label>종료 시각 (PC 현지 시각)
            <input type="datetime-local" disabled={active || working} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <div className="nightnova-wb-line">
            <label>작업별 최대 실행(분)
              <input type="number" min={5} max={180} disabled={active || working} value={config.maxTurnMinutes ?? 90} onChange={(e)=>change({maxTurnMinutes:Number(e.target.value)})}/>
            </label>
            <label>실패 처리
              <select disabled={active || working} value={config.failurePolicy ?? 'stop'} onChange={(e)=>change({failurePolicy:e.target.value as 'stop'|'continue'})}>
                <option value="stop">실패 시 중단</option><option value="continue">실패 기록 후 계속</option>
              </select>
            </label>
          </div>
          <div className="nightnova-wb-line">
            <label>최대 턴
              <input type="number" min="1" max="40" disabled={active || working} value={config.maxTurns} onChange={(e) => change({ maxTurns: Number(e.target.value) })} />
            </label>
            <label>실패 재시도
              <select value={config.maxRetries} disabled={active || working} onChange={(e) => change({ maxRetries: Number(e.target.value) })}>
                <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
              </select>
            </label>
          </div>
          <label className="nightnova-wb-check">
            <input type="checkbox" disabled={active || working} checked={config.autoNext} onChange={(e) => change({ autoNext: e.target.checked })} />
            완료 시 후속 작업을 최대 1개씩 자동 추가
          </label>
          <label className="nightnova-wb-check">
            <input type="checkbox" disabled={active || working} checked={config.permission === 'workspace'} onChange={(e) => change({ permission: e.target.checked ? 'workspace' : 'read-only' })} />
            선택한 Git 작업 폴더 내 파일 변경 허용
          </label>
          <p className="nightnova-wb-note">기본값은 읽기 전용입니다. 자동 개발은 위의 파일 변경 권한을 명시적으로 켜야 합니다. Git push, 커밋, 외부 네트워크·위험 도구는 자동 승인하지 않습니다.</p>
          <label>마지막 통합 검증 (기본 1회)
            <select value={config.validation} disabled={active || working} onChange={(e) => change({ validation: e.target.value as NightnovaConfig['validation'] })}>
              <option value="none">생략</option>
              <option value="light">간단: diff 체크 + 타입 검사</option>
              <option value="full">전체: 타입 + 테스트 + 빌드</option>
            </select>
          </label>
        </section>
        <section className="nightnova-wb-section">
          <h4>2. 작업 큐</h4>
          <div className="nightnova-wb-line">
            <button type="button" disabled={active || working} onClick={() => void action(() => window.rev.nightnova.enqueueBundle('longshot-10'))}>풀롱샷 10작업 추가</button>
            <button type="button" disabled={active || working} onClick={() => void action(() => window.rev.nightnova.queueImport())}>큐 JSON 가져오기</button>
            <button type="button" disabled={working || state.tasks.length===0} onClick={() => { void window.rev.nightnova.queueExport().then(path=>{if(path)setBundleTitle('저장: '+path)}).catch(e=>setError(String(e))) }}>큐 JSON 내보내기</button>
          </div>
          {bundleTitle && <p className="nightnova-path">{bundleTitle}</p>}
          <div className="nightnova-wb-line">
            <select
              title="작업 템플릿"
              aria-label="작업 템플릿 선택"
              disabled={active || working || templates.length === 0}
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              <option value="">작업 템플릿 선택</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.title}</option>
              ))}
            </select>
            <button type="button" disabled={active || working || !templateId} onClick={() => {
              const id = templateId
              void action(async () => {
                const next = await window.rev.nightnova.enqueueTemplate(id)
                setTemplateId('')
                return next
              })
            }}>템플릿 추가</button>
          </div>
          <label className="nightnova-wb-check">
            <input
              type="checkbox" disabled={active || working}
              checked={expectChanges} onChange={(event) => setExpectChanges(event.target.checked)}
            />
            실제 파일 변경이 필요한 개발 작업 (해제하면 읽기 전용 분석)
          </label>
          <form onSubmit={onAdd}>
            <textarea value={input} disabled={active || working} onChange={(e) => setInput(e.target.value)}
              rows={3} maxLength={4000} placeholder="개발할 기능과 완료 기준을 입력하세요." />
            <button type="submit" disabled={active || working || !input.trim()}>작업 추가</button>
          </form>
          <details className="nightnova-bulk">
            <summary>여러 작업을 한 번에 추가</summary>
            <p className="nightnova-wb-note">빈 줄로 구분된 작업을 한 번에 대기열에 넣습니다. 총 40개까지 가능.</p>
            <textarea
              disabled={active || working} rows={5}
              value={bulkInput} onChange={(e) => setBulkInput(e.target.value)}
              placeholder={'작업 A: 로그인 흐름 수정\n\n작업 B: 분할 창 크기 복구\n\n작업 C: 실행 로그 보완'}
            />
            <button type="button" disabled={active || working || !bulkInput.trim()} onClick={addBulk}>
              일괄 추가
            </button>
          </details>
          {state.tasks.length === 0 && <p className="nightnova-wb-note">대기 중인 작업이 없습니다.</p>}
          {state.tasks.map((task, index) => (
            <div className="nightnova-task" key={task.id}>
              <div><strong>{index + 1}. {task.status}</strong><span> 시도 {task.attempts} · {task.expectChanges !== false ? '코드 변경' : '분석'}</span></div>
              {editingId === task.id ? (
                <div>
                  <textarea rows={3} value={editText} onChange={(e)=>setEditText(e.target.value)} maxLength={4000}/>
                  <button type="button" disabled={working || !editText.trim()} onClick={()=>{
                    void action(() => window.rev.nightnova.editTask(task.id, editText, task.expectChanges !== false))
                    setEditingId(null)
                  }}>편집 저장</button>
                  <button type="button" onClick={()=>setEditingId(null)}>취소</button>
                </div>
              ) : <p>{task.instruction}</p>}
              {task.lastError && <small className="nightnova-error">{task.lastError}</small>}
              {task.lastOutput && <details><summary>에이전트 결과</summary><p>{task.lastOutput}</p></details>}
              {task.evidence && (
                <small className="nightnova-wb-note">
                  Git 증거: 변경 {task.evidence.dirtyFiles}개 · {task.evidence.samplePaths.slice(0, 3).join(', ')}
                </small>
              )}
              {!active && task.status !== 'done' && (
                <div className="nightnova-wb-line">
                  <button type="button" disabled={working || index === 0} onClick={() => void action(() => window.rev.nightnova.move(task.id, -1))}>↑</button>
                  <button type="button" disabled={working || index === state.tasks.length - 1} onClick={() => void action(() => window.rev.nightnova.move(task.id, 1))}>↓</button>
                  <button type="button" disabled={working || task.status !== 'queued'} onClick={()=>{setEditingId(task.id);setEditText(task.instruction)}}>편집</button>
                  <button type="button" disabled={working} onClick={() => void action(() => window.rev.nightnova.duplicateTask(task.id))}>복제</button>
                  <button type="button" disabled={working} onClick={() => void action(() => window.rev.nightnova.skipTask(task.id))}>건너뜀</button>
                  <button type="button" disabled={working} onClick={() => void action(() => window.rev.nightnova.remove(task.id))}>삭제</button>
                  {(task.status === 'review' || task.status === 'error') && (
                    <button type="button" disabled={working} onClick={() => {
                      if (confirm('Git 변경 내역을 확인했나요? 이 작업을 새로 재시도 대기열에 넣습니다.')) {
                        void action(() => window.rev.nightnova.retry(task.id))
                      }
                    }}>수동 재시도</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
        <section className="nightnova-wb-section">
          <h4>3. 실행 및 중단</h4>
          <div className="nightnova-wb-line">
            <button type="button" disabled={active || working || !config.workspace} onClick={start}>▶ 시작 / 재개</button>
            <button type="button" disabled={!active || working || Boolean(state.pauseRequested)} onClick={()=>void action(()=>window.rev.nightnova.pauseAfterCurrent())}>현재 작업 후 일시정지</button>
            <button type="button" disabled={!active || working} onClick={() => void action(() => window.rev.nightnova.stop())}>■ 즉시 중단</button>
            <button type="button" disabled={working} onClick={() => void action(() => window.rev.nightnova.checkpoint())}>체크포인트 저장</button>
          </div>
          <div className="nightnova-wb-line">
            <button type="button" disabled={active || working} onClick={() => void action(() => window.rev.nightnova.restore())}>수동 복구</button>
            <button type="button" disabled={active || working} onClick={() => void action(() => window.rev.nightnova.clearFinished())}>완료 작업 정리</button>
            <button type="button" disabled={active || working} onClick={() => {
              if (confirm('작업 목록과 턴 카운터를 초기화할까요? 저장된 Git 파일은 건드리지 않습니다.')) {
                void action(() => window.rev.nightnova.reset())
              }
            }}>새 실행</button>
          </div>
          <p className="nightnova-wb-note">T-5분 신규 턴 금지 · T-30초 취소 · T-25초 강제 종료 · 메인 프로세스 마감 권위. 재시작 시 자동으로 다시 실행하지 않습니다.</p>
          {state.reason && <p>종료/중단 사유: {state.reason}</p>}
          {error && <p className="nightnova-error" role="alert">{error}</p>}
        </section>
        <section className="nightnova-wb-section">
          <h4>4. 진행 로그 / 인계</h4>
          <div className="nightnova-wb-line">
            <button type="button" disabled={!config.workspace || working} onClick={()=>{
              setWorking(true); setError('')
              void window.rev.nightnova.review().then(setReview).catch(e=>setError(String(e))).finally(()=>setWorking(false))
            }}>Git 변경사항 검토</button>
          </div>
          {review && <details open className="nightnova-doctor">
            <summary>Git {review.branch} · 변경 {review.files.length}개 · {review.head}</summary>
            {review.files.map((file,i)=><div key={i} className="nightnova-doctor-item">
              <strong>{file.status} {file.path}</strong>
              {file.previousPath && <span>이전: {file.previousPath}</span>}
            </div>)}
            {review.truncated && <p className="nightnova-wb-note">표시 길이 제한으로 일부 생략되었습니다.</p>}
            <pre className="nightnova-log">{review.stat}{'\n'}{review.diffPreview}</pre>
          </details>}
          <p className="nightnova-wb-note">ACP 도구 호출: {state.toolCalls ?? 0}회 · 권한 허용 {state.permissionsAllowed ?? 0}회 · 거부 {state.permissionsDenied ?? 0}회</p>
          {state.pauseRequested && <p className="nightnova-wb-note">현재 작업 완료 후 일시정지 예약됨</p>}
          {state.currentTurnStartedAt && <p className="nightnova-wb-note">현재 턴 시작: {fmt(state.currentTurnStartedAt)}</p>}
          {(state.recentTools ?? []).slice(-8).map((tool,i)=><div key={tool.id+i} className="nightnova-wb-note">{tool.title} · {tool.status}</div>)}
          {state.liveOutput && <pre className="nightnova-log">{state.liveOutput}</pre>}
          <div className="nightnova-log">
            {state.logs.slice(-20).map((log, index) => (
              <div key={log.at + '-' + index}>[{fmt(log.at)}] {log.type}: {log.message}</div>
            ))}
          </div>
          <div className="nightnova-wb-line">
            <button type="button" disabled={working} onClick={() => void action(() => window.rev.nightnova.handoff())}>
              현재 상태 인계서 생성
            </button>
            <button type="button" disabled={working || !state.handoffPath} onClick={() => {
              void window.rev.nightnova.showHandoff().catch((e) => setError(String(e)))
            }}>
              인계서 폴더 열기
            </button>
          </div>
          <small>체크포인트: {fmt(state.checkpointAt)} · 마지막 활동: {fmt(state.lastActivityAt ?? null)}</small>
          {state.handoffPath && <p className="nightnova-path">인계서: {state.handoffPath}</p>}
          {state.git && (
            <details>
              <summary>Git HEAD {state.git.head} · 변경 상태</summary>
              <pre className="nightnova-log">{state.git.changes || '(clean)'}{String.fromCharCode(10)}{state.git.diffStat}</pre>
            </details>
          )}
          {state.validations.length > 0 && (
            <details>
              <summary>최종 통합검증 {state.validations.every((v) => v.ok) ? 'PASS' : 'FAIL'}</summary>
              {state.validations.map((test) => (
                <div key={test.name}>
                  <strong>{test.name}: {test.ok ? 'PASS' : 'FAIL'}</strong>
                  <pre className="nightnova-log">{test.output.slice(-3000)}</pre>
                </div>
              ))}
            </details>
          )}
        </section>
      </div>
    </div>
  )
}
