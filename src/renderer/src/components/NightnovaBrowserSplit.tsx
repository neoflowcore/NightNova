import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { WebviewTab, type WebviewTabHandle } from './WebviewTab'
import type { Tab } from '@/stores/tabs'
import { useNightnovaSplitStore } from '@/stores/split-view'

interface Props {
  tabs: Tab[]
  activeId: string
  refFor: (id: string) => (handle: WebviewTabHandle | null) => void
  onFocusSecondary: (previousId: string, nextId: string) => void
}

export function NightnovaBrowserSplit({ tabs, activeId, refFor, onFocusSecondary }: Props) {
  const mode = useNightnovaSplitStore((s) => s.mode)
  const ratio = useNightnovaSplitStore((s) => s.ratio)
  const secondaryId = useNightnovaSplitStore((s) => s.secondaryId)
  const setSecondary = useNightnovaSplitStore((s) => s.setSecondary)
  const setRatio = useNightnovaSplitStore((s) => s.setRatio)
  const hostRef = useRef<HTMLDivElement>(null)
  const dragCleanup = useRef<(() => void) | null>(null)
  const split = mode !== 'single' && tabs.length > 1
  const alternate = tabs.find((tab) => tab.id === secondaryId && tab.id !== activeId)
    ?? tabs.find((tab) => tab.id !== activeId)
  const second = split ? alternate?.id ?? null : null

  useEffect(() => () => {
    dragCleanup.current?.()
    document.body.classList.remove('resizing')
  }, [])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const host = hostRef.current
    if (!host || !split) return
    event.preventDefault()
    dragCleanup.current?.()
    document.body.classList.add('resizing')
    const move = (e: PointerEvent): void => {
      const rect = host.getBoundingClientRect()
      const fraction = mode === 'columns'
        ? (e.clientX - rect.left) / Math.max(1, rect.width)
        : (e.clientY - rect.top) / Math.max(1, rect.height)
      setRatio(fraction)
    }
    const end = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('blur', end)
      document.body.classList.remove('resizing')
      dragCleanup.current = null
    }
    dragCleanup.current = end
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('blur', end)
  }

  return (
    <div ref={hostRef} className="nightnova-browser-stage">
      {tabs.map((tab) => {
        const firstPane = tab.id === activeId
        const secondPane = tab.id === second
        const visible = firstPane || secondPane
        const area: React.CSSProperties = {
          position: 'absolute',
          display: visible ? 'flex' : 'none',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          left: mode === 'columns' && secondPane ? String(ratio * 100) + '%' : 0,
          top: mode === 'rows' && secondPane ? String(ratio * 100) + '%' : 0,
          width: mode === 'columns' && split
            ? String((firstPane ? ratio : 1 - ratio) * 100) + '%' : '100%',
          height: mode === 'rows' && split
            ? String((firstPane ? ratio : 1 - ratio) * 100) + '%' : '100%'
        }
        return (
          <div key={tab.id} style={area} data-pane={firstPane ? 'primary' : secondPane ? 'secondary' : 'hidden'}>
            <WebviewTab ref={refFor(tab.id)} tab={tab} active={visible} />
          </div>
        )
      })}
      {split && (
        <>
          <div
            className={'nightnova-browser-divider nightnova-browser-divider--' + mode}
            role="separator"
            aria-label="드래그하여 브라우저 분할 크기 조절"
            aria-orientation={mode === 'columns' ? 'vertical' : 'horizontal'}
            style={mode === 'columns' ? { left: String(ratio * 100) + '%' } : { top: String(ratio * 100) + '%' }}
            onPointerDown={startDrag}
          />
          <div className="nightnova-secondary-controls">
            <label htmlFor="nightnova-secondary">보조 탭</label>
            <select
              id="nightnova-secondary"
              value={second ?? ''}
              onChange={(e) => setSecondary(e.target.value)}
              title="오른쪽 또는 아래쪽 보조 브라우저"
            >
              {tabs.filter((tab) => tab.id !== activeId).map((tab) => (
                <option key={tab.id} value={tab.id}>{tab.title.slice(0, 28) || tab.url.slice(0, 28)}</option>
              ))}
            </select>
            {second && (
              <button type="button" title="보조 탭을 주 탭과 교체" onClick={() => onFocusSecondary(activeId, second)}>
                주 탭 전환
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
