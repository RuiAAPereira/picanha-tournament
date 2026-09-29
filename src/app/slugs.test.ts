import { describe, expect, it } from 'vitest'
import { backupFileName, slugify, tournamentIdFor } from './slugs'

describe('slugs', () => {
  it('turns display names into ids', () => {
    expect(slugify('Rui')).toBe('rui')
    expect(slugify('  João   Côrte-Real ')).toBe('joao-corte-real')
    expect(slugify('Ação!!')).toBe('acao')
    expect(slugify('***')).toBe('')
  })

  it('dates tournament ids and backup names in UTC with only safe characters', () => {
    expect(tournamentIdFor('Taça de Setembro', '2026-09-28T20:15:30.123Z')).toBe('taca-de-setembro-20260928-201530')
    expect(backupFileName('Taça de Setembro', '2026-09-28T20:15:30.123Z')).toBe('taca-de-setembro-20260928-201530.sqlite')
    expect(backupFileName('???', '2026-01-02T03:04:05.000Z')).toBe('torneio-20260102-030405.sqlite')
    expect(backupFileName('Mesa: 1 <final>', '2026-01-02T03:04:05.000Z')).toMatch(/^[a-z0-9-]+\.sqlite$/)
  })
})
