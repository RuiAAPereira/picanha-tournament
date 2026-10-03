import { expect, it } from 'vitest'
import { revealTiming } from './Reveal'

it('lasts between 2 and 5 seconds for any number of items', () => {
  for (let items = 0; items <= 60; items++) {
    const { total, stagger, lead } = revealTiming(items)
    expect(total).toBeGreaterThanOrEqual(2)
    expect(total).toBeLessThanOrEqual(5)
    expect(stagger).toBeGreaterThanOrEqual(0)
    expect(lead).toBeGreaterThan(0)
  }
})
