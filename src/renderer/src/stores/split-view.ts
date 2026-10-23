import { create } from 'zustand'

export type NightnovaSplitMode = 'single' | 'columns' | 'rows'
export type NightnovaAgentDock = 'right' | 'bottom'

interface SplitState {
  mode: NightnovaSplitMode
  secondaryId: string | null
  ratio: number
  agentDock: NightnovaAgentDock
  bottomRatio: number
  setMode: (mode: NightnovaSplitMode) => void
  setSecondary: (id: string | null) => void
  setRatio: (ratio: number) => void
  setAgentDock: (dock: NightnovaAgentDock) => void
  setBottomRatio: (ratio: number) => void
}

const KEY = 'nightnova:split-layout:v1'
const clamp = (n: number): number => Math.max(0.2, Math.min(0.8, Number.isFinite(n) ? n : 0.5))
const stored = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, unknown>
    return {
      mode: raw.mode === 'columns' || raw.mode === 'rows' ? raw.mode : 'single',
      agentDock: raw.agentDock === 'bottom' ? 'bottom' : 'right',
      ratio: typeof raw.ratio === 'number' ? clamp(raw.ratio) : 0.5,
      bottomRatio: typeof raw.bottomRatio === 'number' ? clamp(raw.bottomRatio) : 0.38
    } as const
  } catch {
    return { mode: 'single', agentDock: 'right', ratio: 0.5, bottomRatio: 0.38 } as const
  }
})()

function persist(mode: NightnovaSplitMode, ratio: number, agentDock: NightnovaAgentDock, bottomRatio: number): void {
  try { localStorage.setItem(KEY, JSON.stringify({ mode, ratio, agentDock, bottomRatio })) } catch { /* no storage */ }
}

export const useNightnovaSplitStore = create<SplitState>((set, get) => ({
  ...stored,
  secondaryId: null,
  setMode: (mode) => {
    if (mode !== 'single' && mode !== 'columns' && mode !== 'rows') return
    set({ mode })
    const s = get(); persist(s.mode, s.ratio, s.agentDock, s.bottomRatio)
  },
  setSecondary: (secondaryId) => set({ secondaryId }),
  setRatio: (ratio) => {
    if (!Number.isFinite(ratio)) return
    set({ ratio: clamp(ratio) })
    const s = get(); persist(s.mode, s.ratio, s.agentDock, s.bottomRatio)
  },
  setAgentDock: (agentDock) => {
    if (agentDock !== 'right' && agentDock !== 'bottom') return
    set({ agentDock })
    const s = get(); persist(s.mode, s.ratio, s.agentDock, s.bottomRatio)
  },
  setBottomRatio: (bottomRatio) => {
    if (!Number.isFinite(bottomRatio)) return
    set({ bottomRatio: clamp(bottomRatio) })
    const s = get(); persist(s.mode, s.ratio, s.agentDock, s.bottomRatio)
  }
}))
