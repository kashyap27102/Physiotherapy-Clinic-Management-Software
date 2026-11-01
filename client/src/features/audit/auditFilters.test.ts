import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  auditLinkForPatient,
  auditLinkForUser,
  presetRange,
  readFilters,
  toInput,
  writeFilters,
} from './auditFilters'

const ID = '3f2b8c1e-9a4d-4e6b-8c1d-2a7f5e9b0c11'

describe('audit log filters in the address bar', () => {
  it('reads defaults from an empty address and writes nothing back', () => {
    const filters = readFilters(new URLSearchParams())
    expect(filters).toMatchObject({ page: 1, pageSize: 50 })
    expect(writeFilters(filters).toString()).toBe('')
    expect(activeFilterCount(filters)).toBe(0)
  })

  it('round-trips every filter', () => {
    const params = new URLSearchParams(
      `user=${ID}&patient=${ID}&action=patient.&range=custom&from=2026-10-01&to=2026-10-15&page=3&size=100`,
    )
    expect(writeFilters(readFilters(params)).toString()).toBe(params.toString())
  })

  it('ignores unknown or malformed values from an old bookmark', () => {
    const filters = readFilters(
      new URLSearchParams('user=nope&patient=1&action=DROP TABLE&range=forever&page=-2&size=7&from=yesterday'),
    )
    expect(filters).toEqual({
      userId: undefined,
      patientId: undefined,
      action: undefined,
      preset: undefined,
      from: undefined,
      to: undefined,
      page: 1,
      pageSize: 50,
    })
  })

  it('treats dates without a named range as a custom range', () => {
    expect(readFilters(new URLSearchParams('from=2026-10-01')).preset).toBe('custom')
  })

  it('counts filters but not paging', () => {
    const filters = readFilters(new URLSearchParams(`user=${ID}&from=2026-10-01&to=2026-10-02&page=4`))
    expect(activeFilterCount(filters)).toBe(2)
  })

  it('turns presets into India-day ranges ending today', () => {
    const now = new Date('2026-10-20T10:00:00+05:30')
    expect(presetRange('today', now)).toEqual({ from: '2026-10-20', to: '2026-10-20' })
    expect(presetRange('week', now)).toEqual({ from: '2026-10-14', to: '2026-10-20' })
    expect(presetRange('thisMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-20' })
    expect(presetRange('custom', now)).toEqual({})
  })

  it('builds the API input, adding the branch chosen in the top bar', () => {
    const input = toInput(readFilters(new URLSearchParams(`patient=${ID}`)), 'b1')
    expect(input).toMatchObject({ patientId: ID, branchId: 'b1', page: 1, pageSize: 50 })
    expect(toInput(readFilters(new URLSearchParams()), null).branchId).toBeUndefined()
  })

  it('builds deep links that carry ids only', () => {
    expect(auditLinkForPatient(ID)).toBe(`/audit-log?patient=${ID}`)
    expect(auditLinkForUser(ID)).toBe(`/audit-log?user=${ID}`)
  })
})
