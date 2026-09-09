import { describe, expect, it } from 'vitest'

import { NODE_HEIGHT, NODE_WIDTH } from './layout'
import {
  centreOn,
  clampScale,
  fit,
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  toScreen,
  toWorld,
  transformOf,
  zoomAround,
} from './viewport'

const view = { width: 1000, height: 800 }

describe('座標の対応', () => {
  it('world と screen を往復できる', () => {
    const viewport = { x: 120, y: -40, scale: 1.5 }
    const world = { x: 320, y: 74 }

    expect(toWorld(viewport, toScreen(viewport, world))).toEqual(world)
  })

  it('等倍・原点なら値がそのまま', () => {
    expect(toScreen(IDENTITY, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 })
  })

  it('`<g>` に載せる形は、読み順と式が一致する', () => {
    expect(transformOf({ x: 12, y: 34, scale: 0.5 })).toBe('translate(12,34) scale(0.5)')
  })
})

describe('倍率の範囲', () => {
  it.each([
    [0.01, MIN_SCALE],
    [10, MAX_SCALE],
    [1, 1],
  ])('%s → %s に収める', (given, expected) => {
    expect(clampScale(given)).toBe(expected)
  })
})

describe('全体表示', () => {
  it('図が画面より大きければ縮めて収める', () => {
    const viewport = fit({ width: 4000, height: 2000 }, view)

    expect(viewport.scale).toBeLessThan(1)
    // 収まっている（余白ぶんを含めても画面内）
    expect(4000 * viewport.scale).toBeLessThanOrEqual(view.width)
    expect(2000 * viewport.scale).toBeLessThanOrEqual(view.height)
  })

  it('図が画面より小さくても拡大しない', () => {
    const viewport = fit({ width: 200, height: 100 }, view)

    expect(viewport.scale).toBe(1)
  })

  it('画面の中央に置く', () => {
    const viewport = fit({ width: 200, height: 100 }, view)

    expect(viewport.x).toBe((view.width - 200) / 2)
    expect(viewport.y).toBe((view.height - 100) / 2)
  })

  it('図も画面も大きさが無ければ何もしない', () => {
    expect(fit({ width: 0, height: 0 }, view)).toEqual(IDENTITY)
    expect(fit({ width: 100, height: 100 }, { width: 0, height: 0 })).toEqual(IDENTITY)
  })
})

describe('拡大縮小', () => {
  it('指した点の下にあるものが動かない', () => {
    const viewport = { x: 50, y: 30, scale: 1 }
    const anchor = { x: 400, y: 300 }
    const before = toWorld(viewport, anchor)

    const zoomed = zoomAround(viewport, anchor, 2)

    expect(toWorld(zoomed, anchor).x).toBeCloseTo(before.x)
    expect(toWorld(zoomed, anchor).y).toBeCloseTo(before.y)
  })

  it('範囲の外まで倍率を上げられない', () => {
    const zoomed = zoomAround(IDENTITY, { x: 0, y: 0 }, 99)

    expect(zoomed.scale).toBe(MAX_SCALE)
  })
})

describe('平行移動', () => {
  it('画面のぶんだけ動く。倍率は変わらない', () => {
    const moved = panBy({ x: 10, y: 20, scale: 1.5 }, -30, 40)

    expect(moved).toEqual({ x: -20, y: 60, scale: 1.5 })
  })
})

describe('ノードへ寄せる', () => {
  it('ノードの中心が画面の中心に来る', () => {
    const viewport = { x: 0, y: 0, scale: 1 }
    const node = { x: 1200, y: 400 }

    const moved = centreOn(viewport, node, view)

    const centre = toScreen(moved, { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT / 2 })
    expect(centre.x).toBeCloseTo(view.width / 2)
    expect(centre.y).toBeCloseTo(view.height / 2)
  })

  it('倍率は変えない。行き先を見るたびに縮尺が変わらない', () => {
    const moved = centreOn({ x: 0, y: 0, scale: 0.6 }, { x: 100, y: 100 }, view)

    expect(moved.scale).toBe(0.6)
  })
})
