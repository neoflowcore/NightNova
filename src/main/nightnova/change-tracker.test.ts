import { describe, expect, it } from 'vitest'
import { hasNightnovaChanges } from './change-tracker'
import type { NightnovaChangeEvidence } from '../../shared/nightnova'

const make = (fingerprint: string): NightnovaChangeEvidence => ({
  fingerprint, head: 'abc', dirtyFiles: 2, samplePaths: ['src/index.ts'], capturedAt: 0
})

describe('Nightnova change evidence', () => {
  it('rejects identical snapshots even when the tree is already dirty', () => {
    expect(hasNightnovaChanges(make('same'), make('same'))).toBe(false)
  })
  it('accepts a changed fingerprint when the dirty file count remains constant', () => {
    expect(hasNightnovaChanges(make('before'), make('after'))).toBe(true)
  })
})
