import { describe, expect, it } from 'vitest'
import { passwordStrength } from './passwordStrength'

describe('passwordStrength (AUTH-004 hint)', () => {
  it('scores 0 below the 10-character minimum', () => {
    expect(passwordStrength('')).toBe(0)
    expect(passwordStrength('Abc!12345')).toBe(0)
  })

  it('rewards length and variety', () => {
    expect(passwordStrength('abcdefghij')).toBe(1)
    expect(passwordStrength('abcdefghijkl')).toBe(2)
    expect(passwordStrength('Blue-Tiger-Runs-42')).toBe(4)
  })

  it('penalises repetition', () => {
    expect(passwordStrength('aaaaaaaaaaaaaaaa')).toBe(1)
  })
})
