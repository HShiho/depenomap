import { describe, expect, it } from 'vitest'

import { NODE_HEIGHT, NODE_WIDTH } from './layout'
import {
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  centreOn,
  clampScale,
  fit,
  fitBounds,
  panBy,
  toScreen,
  toWorld,
  transformOf,
  zoomAround,
  reveal,
  REVEAL_MARGIN,
  type Viewport,
  zoomAnchorOf,
  ZOOM_IN_STEP,
  ZOOM_OUT_STEP,
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

  it('画面が余白より狭くても、図を画面外へ飛ばさない', () => {
    const viewport = fit({ width: 1900, height: 700 }, { width: 40, height: 800 })

    // 収まりきらないのは仕方がないが、左上より外から描き始めない
    expect(viewport.x).toBeGreaterThanOrEqual(0)
    expect(viewport.scale).toBeGreaterThan(0)
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

describe('外接矩形に合わせる（UT-17）', () => {
  it('原点から始まるときは、大きさで合わせるのと同じ', () => {
    const size = { width: 800, height: 600 }
    const view = { width: 1200, height: 800 }

    expect(fitBounds({ minX: 0, minY: 0, maxX: size.width, maxY: size.height }, view)).toEqual(
      fit(size, view),
    )
  })

  it('負の側へ出ていても、画面の中に収まる', () => {
    // 手で動かすと座標は負になる。右下だけを数えると左や上が入らない
    const bounds = { minX: -400, minY: -200, maxX: 800, maxY: 600 }
    const view = { width: 1200, height: 800 }

    const at = fitBounds(bounds, view)

    const topLeft = { x: bounds.minX * at.scale + at.x, y: bounds.minY * at.scale + at.y }
    const bottomRight = { x: bounds.maxX * at.scale + at.x, y: bounds.maxY * at.scale + at.y }
    expect(topLeft.x).toBeGreaterThanOrEqual(0)
    expect(topLeft.y).toBeGreaterThanOrEqual(0)
    expect(bottomRight.x).toBeLessThanOrEqual(view.width)
    expect(bottomRight.y).toBeLessThanOrEqual(view.height)
  })
})

describe('ボタンでの拡大縮小（UT-28 / M-11）', () => {
  const view = { width: 800, height: 600 }
  const start = { x: 40, y: -20, scale: 1 }

  it('刻みは参照仕様どおり 1.25 倍と 0.8 倍', () => {
    expect(ZOOM_IN_STEP).toBe(1.25)
    expect(ZOOM_OUT_STEP).toBe(0.8)
  })

  it('画面の中心を軸にし、中心にあったものは動かない', () => {
    const anchor = zoomAnchorOf(view)
    const before = toWorld(start, anchor)
    const after = zoomAround(start, anchor, start.scale * ZOOM_IN_STEP)

    expect(anchor).toEqual({ x: 400, y: 300 })
    expect(toScreen(after, before).x).toBeCloseTo(400)
    expect(toScreen(after, before).y).toBeCloseTo(300)
  })
})

describe('ノードを見える位置に入れる（UT-21）', () => {
  const view = { width: 800, height: 600 }
  const at = (viewport: Viewport, node: { x: number; y: number }) => ({
    left: node.x * viewport.scale + viewport.x,
    top: node.y * viewport.scale + viewport.y,
    right: (node.x + NODE_WIDTH) * viewport.scale + viewport.x,
    bottom: (node.y + NODE_HEIGHT) * viewport.scale + viewport.y,
  })

  it('すでに見えていれば動かさない（辿るだけで視点が変わらないように）', () => {
    const viewport = { x: 0, y: 0, scale: 1 }
    expect(reveal(viewport, { x: 100, y: 100 }, view)).toBe(viewport)
  })

  it('右・下にはみ出していれば、余白を残して入る分だけ動かす', () => {
    const viewport = { x: 0, y: 0, scale: 1 }
    const next = reveal(viewport, { x: 900, y: 700 }, view)
    const box = at(next, { x: 900, y: 700 })

    expect(next.scale).toBe(1)
    expect(box.right).toBeCloseTo(view.width - REVEAL_MARGIN)
    expect(box.bottom).toBeCloseTo(view.height - REVEAL_MARGIN)
  })

  it('左・上にはみ出していれば、余白を残して入る分だけ動かす', () => {
    const viewport = { x: 0, y: 0, scale: 2 }
    const next = reveal(viewport, { x: -50, y: -40 }, view)
    const box = at(next, { x: -50, y: -40 })

    expect(box.left).toBeCloseTo(REVEAL_MARGIN)
    expect(box.top).toBeCloseTo(REVEAL_MARGIN)
  })

  it('画面よりノードが大きければ、左上を合わせる', () => {
    const viewport = { x: 0, y: 0, scale: 2.5 }
    const tiny = { width: 200, height: 60 }
    const next = reveal(viewport, { x: 300, y: 300 }, tiny)
    const box = at(next, { x: 300, y: 300 })

    expect(box.left).toBeCloseTo(REVEAL_MARGIN)
    expect(box.top).toBeCloseTo(REVEAL_MARGIN)
  })
})

describe('ノードを見える位置に入れる：画面が小さいとき（UT-21 / R1-07）', () => {
  it('画面の実寸が測れていない（0）ときは動かさない', () => {
    // ResizeObserver の無い環境では 0 のまま。押すたびに左上へ寄せない
    const viewport = { x: 10, y: 20, scale: 1 }
    expect(reveal(viewport, { x: 500, y: 500 }, { width: 0, height: 0 })).toBe(viewport)
  })

  it('画面よりノードが大きくても、一部でも見えていれば動かさない', () => {
    const viewport = { x: 0, y: 0, scale: 2.5 }
    const tiny = { width: 200, height: 60 }
    // ノードの左上が画面の中にある
    expect(reveal(viewport, { x: 10, y: 5 }, tiny)).toBe(viewport)
  })
})
