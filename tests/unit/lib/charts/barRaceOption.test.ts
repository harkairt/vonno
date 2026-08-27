import { describe, it, expect } from 'vitest'
import {
  BAR_RACE_DEFAULT_STEP_DURATION_MS,
  resolveStepDuration,
  formatFrameLabel,
  buildBarRaceOption,
} from '@/lib/charts/barRaceOption'
import type { BarRaceData } from '@/lib/validation/barRace'

function makeData(overrides: Partial<BarRaceData> = {}): BarRaceData {
  return {
    categories: ['Alpha', 'Beta', 'Gamma'],
    start: 2000,
    end: 2002,
    step: 1,
    sort: 'desc',
    maxBars: null,
    stepDuration: null,
    frames: [
      { Alpha: 1, Beta: 2, Gamma: 3 },
      { Alpha: 4, Beta: 5, Gamma: 6 },
      { Alpha: 7, Beta: 8, Gamma: 9 },
    ],
    ...overrides,
  }
}

describe('resolveStepDuration', () => {
  it('falls back to the default when stepDuration is null', () => {
    expect(resolveStepDuration(makeData())).toBe(BAR_RACE_DEFAULT_STEP_DURATION_MS)
  })

  it('returns the explicit stepDuration when set', () => {
    expect(resolveStepDuration(makeData({ stepDuration: 250 }))).toBe(250)
  })
})

describe('formatFrameLabel', () => {
  it('renders integer steps without decimals', () => {
    expect(formatFrameLabel(makeData(), 2)).toBe('2002')
  })

  it('renders fractional steps with two decimals', () => {
    expect(formatFrameLabel(makeData({ start: 0, step: 0.25 }), 1)).toBe('0.25')
    expect(formatFrameLabel(makeData({ start: 0, step: 1 / 3 }), 1)).toBe('0.33')
  })
})

describe('buildBarRaceOption', () => {
  it('maps categories to the frame values, defaulting missing keys to 0', () => {
    const option = buildBarRaceOption(makeData({ frames: [{ Alpha: 10 }, {}, {}] }), 0)

    expect(option.series).toEqual([
      expect.objectContaining({
        type: 'bar',
        realtimeSort: true,
        data: [
          { name: 'Alpha', value: 10 },
          { name: 'Beta', value: 0 },
          { name: 'Gamma', value: 0 },
        ],
      }),
    ])
  })

  it('renders all zeros for an out-of-range frame index', () => {
    const option = buildBarRaceOption(makeData(), 99)
    const series = (option.series as Array<{ data: Array<{ value: number }> }>)[0]

    expect(series?.data.every((d) => d.value === 0)).toBe(true)
  })

  it('inverts the category axis unless sorting ascending', () => {
    expect((buildBarRaceOption(makeData(), 0).yAxis as { inverse: boolean }).inverse).toBe(true)
    expect(
      (buildBarRaceOption(makeData({ sort: 'asc' }), 0).yAxis as { inverse: boolean }).inverse,
    ).toBe(false)
  })

  it('limits visible bars to maxBars, capped at the category count', () => {
    const yAxisOf = (data: BarRaceData) => buildBarRaceOption(data, 0).yAxis as { max: number }

    expect(yAxisOf(makeData()).max).toBe(2)
    expect(yAxisOf(makeData({ maxBars: 2 })).max).toBe(1)
    expect(yAxisOf(makeData({ maxBars: 50 })).max).toBe(2)
  })

  it('derives the update animation from the step duration', () => {
    const option = buildBarRaceOption(makeData({ stepDuration: 1000 }), 0)

    expect(option.animationDurationUpdate).toBe(800)
  })
})
