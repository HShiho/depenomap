import { describe, expect, it } from 'vitest'

import { edgePath } from './edge-path'
import { COLUMN_WIDTH, NODE_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from './layout'

/** `M x,y C ...` から座標だけを取り出す */
function points(path: string): number[][] {
  return [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)])
}

const start = points
const at = (x: number, y: number) => ({ x, y })
const midY = NODE_HEIGHT / 2

describe('前向き（使う側が左）', () => {
  const path = edgePath(at(0, 0), at(COLUMN_WIDTH, ROW_HEIGHT))

  it('使う側の右辺から出て、使われる側の左辺へ入る', () => {
    const [first] = start(path)
    const last = points(path).at(-1)!

    expect(first).toEqual([NODE_WIDTH, midY])
    expect(last).toEqual([COLUMN_WIDTH, ROW_HEIGHT + midY])
  })

  it('曲線で描く（制御点を 2 つ持つ）', () => {
    expect(path.startsWith('M')).toBe(true)
    expect(path).toContain('C')
    expect(points(path)).toHaveLength(4)
  })
})

describe('後ろ向き（使う側が右）', () => {
  const path = edgePath(at(COLUMN_WIDTH, 0), at(0, 0))

  it('使う側の左辺から出て、使われる側の右辺へ入る', () => {
    const [first] = start(path)
    const last = points(path).at(-1)!

    expect(first).toEqual([COLUMN_WIDTH, midY])
    expect(last).toEqual([NODE_WIDTH, midY])
  })

  it('外側へ回り込ませる。始点より左、終点より右へ制御点を置く', () => {
    const [first, control1, control2] = points(path)

    expect(control1![0]).toBeLessThan(first![0]!)
    expect(control2![0]).toBeGreaterThan(NODE_WIDTH)
  })
})

describe('同じ列', () => {
  it('右側へ膨らませて戻す。左へ出すと隣の列の線と重なる', () => {
    const path = edgePath(at(0, 0), at(0, ROW_HEIGHT * 2))
    const [first, control1, control2, last] = points(path)

    expect(first).toEqual([NODE_WIDTH, midY])
    expect(last).toEqual([NODE_WIDTH, ROW_HEIGHT * 2 + midY])
    expect(control1![0]).toBeGreaterThan(NODE_WIDTH)
    expect(control2![0]).toBeGreaterThan(NODE_WIDTH)
  })

  it('少しのずれは同じ列として扱う。手で動かした直後に形が飛ばない', () => {
    const straight = edgePath(at(0, 0), at(0, ROW_HEIGHT))
    const nudged = edgePath(at(0, 0), at(12, ROW_HEIGHT))

    expect(points(nudged).at(-1)![0]).toBe(12 + NODE_WIDTH)
    expect(points(straight)).toHaveLength(points(nudged).length)
  })
})

describe('依存の良し悪しを形で表さない（N-1）', () => {
  it('列を戻る依存も、進む依存と同じ組み立ての曲線で描く', () => {
    const forward = edgePath(at(0, 0), at(COLUMN_WIDTH, 0))
    const backward = edgePath(at(COLUMN_WIDTH, 0), at(0, 0))

    // 破線・二重線などの区別を入れない。座標が違うだけの同じ形
    expect(forward.replace(/[\d.,-]/g, '')).toBe(backward.replace(/[\d.,-]/g, ''))
  })

  it('列を飛び越す線は上へ逃がす。読める形にするためで、意味は変えない', () => {
    const near = edgePath(at(0, 0), at(COLUMN_WIDTH, 0))
    const far = edgePath(at(0, 0), at(COLUMN_WIDTH * 3, 0))

    const nearControl = points(near)[1]![1]
    const farControl = points(far)[1]![1]
    expect(nearControl).toBe(midY)
    expect(farControl).toBeLessThan(midY)
  })
})
