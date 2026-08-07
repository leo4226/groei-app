import { describe, it, expect } from 'vitest'
import { parseCm } from '../objectDimensions'

// M1: objects could be rotated and deleted but never resized. width_cm,
// depth_cm and diameter_cm were sent once at create time and were then
// unreachable, so a table or shed was stuck at its palette preset forever.
// The columns are INTEGER and asyncpg raises DataError on a float or a string
// (CLAUDE.md § Database, #142), so what this field emits has to be exact.

describe('parseCm', () => {
  it('sends an integer, never a float', () => {
    expect(parseCm('90')).toBe(90)
    expect(parseCm('90.4')).toBe(90)
    expect(parseCm('90.6')).toBe(91)
    expect(Number.isInteger(parseCm('120.5') as number)).toBe(true)
  })

  it('clears the dimension on an empty field rather than writing 0', () => {
    expect(parseCm('')).toBeNull()
    expect(parseCm('   ')).toBeNull()
  })

  it('holds still on a half-typed or nonsense value', () => {
    // undefined means "do not write" — otherwise clearing the field to retype
    // it would fire an update for every intermediate keystroke.
    expect(parseCm('abc')).toBeUndefined()
    expect(parseCm('-')).toBeUndefined()
    expect(parseCm('.')).toBeUndefined()
  })

  it('refuses a zero or negative size', () => {
    // A zero-width object renders as an invisible shape that can still be
    // selected — worse than refusing the edit.
    expect(parseCm('0')).toBeUndefined()
    expect(parseCm('-40')).toBeUndefined()
    expect(parseCm('0.4')).toBeUndefined()   // rounds to 0
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseCm('  75  ')).toBe(75)
  })
})
