import { describe, expect, it } from 'vitest'

import { DRAG_THRESHOLD } from './node-drag'
import { dragThresholdFor, LONG_PRESS_MS, pan, pinch, TOUCH_DRAG_THRESHOLD } from './touch-gesture'
import { MAX_SCALE, MIN_SCALE, toScreen, toWorld } from './viewport'

describe('動かしたとみなすしきい値（UT-22）', () => {
  it('指はマウスよりぶれるので、指だけ大きく取る', () => {
    expect(dragThresholdFor('touch')).toBe(TOUCH_DRAG_THRESHOLD)
    expect(TOUCH_DRAG_THRESHOLD).toBe(8)
  })

  it('マウス・ペンはこれまでどおり（UT-17）', () => {
    expect(dragThresholdFor('mouse')).toBe(DRAG_THRESHOLD)
    expect(dragThresholdFor('pen')).toBe(DRAG_THRESHOLD)
  })
})

describe('長押し（UT-22）', () => {
  it('約 0.5 秒', () => {
    expect(LONG_PRESS_MS).toBe(500)
  })
})

describe('1 本指のパン（UT-22）', () => {
  it('指が動いたぶん、図も同じだけ動く（倍率は変えない）', () => {
    const viewport = { x: 10, y: 20, scale: 1.5 }

    expect(pan(viewport, { x: 100, y: 100 }, { x: 130, y: 80 })).toEqual({
      x: 40,
      y: 0,
      scale: 1.5,
    })
  })
})

describe('2 本指のピンチ（UT-22）', () => {
  const viewport = { x: 0, y: 0, scale: 1 }

  it('指の間が広がったぶん拡大し、2 本の指の中点にあったものは指の下に留まる', () => {
    const before = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ] as const
    const after = [
      { x: 75, y: 100 },
      { x: 225, y: 100 },
    ] as const
    const midpoint = { x: 150, y: 100 }
    const world = toWorld(viewport, midpoint)

    const next = pinch(viewport, before, after)

    expect(next.scale).toBeCloseTo(1.5)
    expect(toScreen(next, world).x).toBeCloseTo(150)
    expect(toScreen(next, world).y).toBeCloseTo(100)
  })

  it('2 本の指がそろって動けば、そのぶん図も動く', () => {
    const next = pinch(
      viewport,
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 120, y: 130 },
        { x: 220, y: 130 },
      ],
    )

    expect(next.scale).toBeCloseTo(1)
    expect(next.x).toBeCloseTo(20)
    expect(next.y).toBeCloseTo(30)
  })

  it('倍率の上下限（UT-16）で止まる', () => {
    const wide = pinch(
      viewport,
      [
        { x: 100, y: 100 },
        { x: 101, y: 100 },
      ],
      [
        { x: 0, y: 100 },
        { x: 1000, y: 100 },
      ],
    )
    const narrow = pinch(
      viewport,
      [
        { x: 0, y: 100 },
        { x: 1000, y: 100 },
      ],
      [
        { x: 500, y: 100 },
        { x: 501, y: 100 },
      ],
    )

    expect(wide.scale).toBe(MAX_SCALE)
    expect(narrow.scale).toBe(MIN_SCALE)
  })

  it('2 本の指が同じ位置に重なっていても壊れない（倍率は変えない）', () => {
    const same = { x: 100, y: 100 }

    expect(pinch(viewport, [same, same], [same, { x: 120, y: 100 }]).scale).toBe(1)
  })
})
