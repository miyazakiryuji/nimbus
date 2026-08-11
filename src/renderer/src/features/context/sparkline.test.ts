import { describe, expect, it } from 'vitest'
import { toBarHeights, toSparklinePoints } from './sparkline'

describe('toSparklinePoints', () => {
  it('空配列は空文字', () => {
    expect(toSparklinePoints([], 100, 20)).toBe('')
  })

  it('単一値は中央に置かれる', () => {
    expect(toSparklinePoints([5], 100, 20)).toBe('50.0,0.0')
  })

  it('最大値が上端・ゼロが下端になる', () => {
    const points = toSparklinePoints([0, 10], 100, 20).split(' ')
    expect(points[0]).toBe('0.0,20.0')
    expect(points[1]).toBe('100.0,0.0')
  })

  it('等間隔に x が割り当てられる', () => {
    const xs = toSparklinePoints([1, 1, 1], 100, 20)
      .split(' ')
      .map((p) => Number(p.split(',')[0]))
    expect(xs).toEqual([0, 50, 100])
  })
})

describe('toBarHeights', () => {
  it('最大値が 1.0 になるよう正規化される', () => {
    expect(toBarHeights([5, 10])).toEqual([0.5, 1])
  })

  it('全ゼロでも NaN にならない', () => {
    expect(toBarHeights([0, 0])).toEqual([0, 0])
  })
})
