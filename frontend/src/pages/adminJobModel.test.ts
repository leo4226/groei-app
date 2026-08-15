import { describe, expect, it } from 'vitest'
import {
  describeSkip,
  etaSeconds,
  formatAuditDetail,
  formatDuration,
  iconJobSummary,
  skipSubject,
} from './adminJobModel'

describe('formatDuration', () => {
  it('stays in seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45.4)).toBe('45s')
  })

  it('pads the seconds so the clock does not jitter in width', () => {
    expect(formatDuration(60)).toBe('1m 00s')
    expect(formatDuration(65)).toBe('1m 05s')
    expect(formatDuration(600)).toBe('10m 00s')
  })

  it('renders nothing rather than NaN for a missing start time', () => {
    expect(formatDuration(NaN)).toBe('')
    expect(formatDuration(-1)).toBe('')
  })
})

describe('etaSeconds', () => {
  it('extrapolates from the items already finished', () => {
    // 4 of 10 done in 20s → 5s each → 30s left.
    expect(etaSeconds(4, 10, 20)).toBe(30)
  })

  it('says nothing until two items are done', () => {
    // The first item carries cold start, so a one-sample estimate is worse
    // than no estimate.
    expect(etaSeconds(0, 10, 5)).toBeNull()
    expect(etaSeconds(1, 10, 5)).toBeNull()
    expect(etaSeconds(2, 10, 5)).not.toBeNull()
  })

  it('says nothing once the work is done', () => {
    expect(etaSeconds(10, 10, 50)).toBeNull()
  })
})

describe('iconJobSummary', () => {
  it('counts generic fallbacks apart from real AI icons', () => {
    // The heart of it: a fallback renders, but does not count as covered, so
    // those species reappear as missing next run. Rolling them into one
    // "generated" number is what made generation look like it skipped plants.
    const summary = iconJobSummary({
      count: 5, ai_count: 3, fallback_count: 2, skipped_count: 0,
      sync_result: { matched: 4 }, remaining: 7,
    })
    expect(summary).toContain('3 AI icons')
    expect(summary).toContain('2 generic fallbacks')
    expect(summary).toContain('7 left')
  })

  it('omits the fallback clause when every icon came from the AI', () => {
    const summary = iconJobSummary({
      count: 3, ai_count: 3, fallback_count: 0, skipped_count: 0,
      sync_result: { matched: 3 }, remaining: 0,
    })
    expect(summary).not.toContain('fallback')
    expect(summary).toContain('3 AI icons')
  })

  it('singularises a lone fallback', () => {
    expect(iconJobSummary({ count: 1, ai_count: 0, fallback_count: 1 }))
      .toContain('1 generic fallback ')
  })

  it('survives a result from an older backend with no new counters', () => {
    // ai_count/fallback_count did not exist before; a job row stored then must
    // still render rather than showing NaN.
    expect(iconJobSummary({ count: 4, skipped_count: 1, remaining: 2 }))
      .toBe('✓ 4 AI icons · 1 failed · 0 plants matched · 2 left')
  })

  it('handles a null result', () => {
    expect(iconJobSummary(null)).toContain('0 AI icons')
  })
})

describe('describeSkip', () => {
  it('translates a machine reason into something actionable', () => {
    expect(describeSkip({ reason: 'ai_failed_used_generic_art' }))
      .toContain('come back next run')
    expect(describeSkip({ reason: 'r2_upload_failed' })).toContain('R2 storage')
  })

  it('passes an unknown reason through rather than hiding it', () => {
    expect(describeSkip({ reason: 'something_new' })).toBe('something_new')
  })

  it('falls back to the raw error, then the message', () => {
    expect(describeSkip({ error: 'boom' })).toBe('boom')
    expect(describeSkip({ message: 'nope' })).toBe('nope')
    expect(describeSkip({})).toBe('skipped')
  })
})

describe('skipSubject', () => {
  it('prefers a name, then an icon key, then any id', () => {
    expect(skipSubject({ name: 'Roos', id: 3 })).toBe('Roos')
    expect(skipSubject({ icon_key: 'gen_roos' })).toBe('gen_roos')
    expect(skipSubject({ species_id: 7 })).toBe('7')
    expect(skipSubject({})).toBe('unknown')
  })
})

describe('formatAuditDetail', () => {
  it('renders a nested params object instead of [object Object]', () => {
    // start_job is the most common audit action, and its detail is
    // {job_id, params:{...}} — String() on that produced "[object Object]",
    // making the busiest rows in the log useless.
    const line = formatAuditDetail({
      job_id: 42,
      params: { scope: 'in_use', map_only: true, limit: 25 },
    })
    expect(line).not.toContain('[object Object]')
    expect(line).toContain('job_id: 42')
    expect(line).toContain('scope=in_use')
    expect(line).toContain('limit=25')
  })

  it('joins arrays rather than stringifying them', () => {
    expect(formatAuditDetail({ fields: ['name', 'latin_name'] }))
      .toBe('fields: name, latin_name')
  })

  it('JSON-encodes anything deeper than one level', () => {
    const line = formatAuditDetail({ params: { nested: { a: 1 } } })
    expect(line).toContain('nested={"a":1}')
  })

  it('drops null and undefined entries', () => {
    expect(formatAuditDetail({ a: 1, b: null, c: undefined })).toBe('a: 1')
  })

  it('returns null for no detail', () => {
    expect(formatAuditDetail(null)).toBeNull()
  })
})

describe('structural icon blockers', () => {
  it('explains the two reasons a plant can never get a generated icon', () => {
    // These are why Settings can say "3 plants without an icon" while the admin
    // panel offers to generate for 2: it counts species, and some plants are
    // unreachable regardless of how many runs you do.
    // The label names the tool that fixes it, rather than sending the reader
    // to edit each plant by hand.
    expect(describeSkip({ reason: 'no_species_link' }))
      .toContain('Link plants to a species')
    expect(describeSkip({ reason: 'species_has_no_latin_name' }))
      .toContain('latin name')
  })
})
