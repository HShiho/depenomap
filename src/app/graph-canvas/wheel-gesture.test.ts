import { describe, expect, it } from 'vitest'

import { MAX_SCALE, MIN_SCALE, toWorld, type Viewport } from './viewport'
import { applyWheel, isZoomGesture, type WheelInput } from './wheel-gesture'

const START: Viewport = { x: 100, y: 50, scale: 1 }

function wheel(input: Partial<WheelInput> = {}): WheelInput {
  return {
    deltaX: 0,
    deltaY: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    deltaMode: 0,
    point: { x: 400, y: 300 },
    ...input,
  }
}

describe('移動（US-16）', () => {
  it('2 本指スクロールで縦横に動く', () => {
    const after = applyWheel(START, wheel({ deltaX: 30, deltaY: 20 }))

    expect(after).toEqual({ x: 70, y: 30, scale: 1 })
  })

  it('下へスクロールすると、図は上へ動く', () => {
    // 図を動かすのではなく、図の上を移動している
    const after = applyWheel(START, wheel({ deltaY: 40 }))

    expect(after.y).toBeLessThan(START.y)
  })

  it('Shift を押すと、縦の回転が横の移動になる', () => {
    // ホイールしか持たない環境で横へ動かす唯一の手段（スプレッドシートと同じ）
    const after = applyWheel(START, wheel({ deltaY: 40, shiftKey: true }))

    expect(after).toEqual({ x: 60, y: 50, scale: 1 })
  })

  it('Shift 付きで横だけ届いても、横へ動く', () => {
    // ブラウザによっては Shift + ホイールを自分で横へ振り替えて送ってくる
    const after = applyWheel(START, wheel({ deltaX: 40, deltaY: 0, shiftKey: true }))

    expect(after).toEqual({ x: 60, y: 50, scale: 1 })
  })

  it('行単位で届く環境でも、px と同じ桁で動く', () => {
    // Firefox + 物理ホイールは `deltaY = ±3` を行単位で送る
    const line = applyWheel(START, wheel({ deltaY: 3, deltaMode: 1 }))
    const pixel = applyWheel(START, wheel({ deltaY: 3 }))

    expect(START.y - line.y).toBeGreaterThan((START.y - pixel.y) * 10)
  })

  it('ページ単位で届く環境でも、px と同じ桁で動く', () => {
    const page = applyWheel(START, wheel({ deltaY: 1, deltaMode: 2 }))

    expect(START.y - page.y).toBeGreaterThan(100)
  })

  it('移動では倍率が変わらない', () => {
    const after = applyWheel(START, wheel({ deltaX: 10, deltaY: 10 }))

    expect(after.scale).toBe(START.scale)
  })
})

describe('拡大縮小（US-16）', () => {
  it('ピンチ（ctrl 付きのホイール）で拡大する', () => {
    // ブラウザはトラックパッドのピンチを Ctrl + ホイールに変換する
    const after = applyWheel(START, wheel({ deltaY: -50, ctrlKey: true }))

    expect(after.scale).toBeGreaterThan(START.scale)
  })

  it('逆向きのピンチで縮小する', () => {
    const after = applyWheel(START, wheel({ deltaY: 50, ctrlKey: true }))

    expect(after.scale).toBeLessThan(START.scale)
  })

  it('⌘ を押しながらのホイールでも拡大縮小になる', () => {
    const meta = applyWheel(START, wheel({ deltaY: -50, metaKey: true }))

    expect(meta.scale).toBeGreaterThan(START.scale)
  })

  it('ポインタの下にあるものが動かない', () => {
    // 倍率だけを変えると、図が画面の左上へ寄っていく
    const point = { x: 640, y: 210 }
    const before = toWorld(START, point)
    const after = applyWheel(START, wheel({ deltaY: -120, ctrlKey: true, point }))

    const moved = toWorld(after, point)
    expect(moved.x).toBeCloseTo(before.x, 6)
    expect(moved.y).toBeCloseTo(before.y, 6)
  })

  it('行単位で届く拡大縮小も、px と同じ桁で効く', () => {
    const line = applyWheel(START, wheel({ deltaY: -3, deltaMode: 1, ctrlKey: true }))
    const pixel = applyWheel(START, wheel({ deltaY: -3, ctrlKey: true }))

    expect(line.scale - START.scale).toBeGreaterThan((pixel.scale - START.scale) * 10)
  })

  it('効きが、いまの倍率に比例する', () => {
    /*
     * 同じ回転量なら、どの倍率からでも**同じ比率**で変わる。線形に足すと、
     * 縮小側では一気に効き、拡大側ではほとんど効かない。
     */
    const small = applyWheel({ ...START, scale: 0.5 }, wheel({ deltaY: -100, ctrlKey: true }))
    const large = applyWheel({ ...START, scale: 2 }, wheel({ deltaY: -100, ctrlKey: true }))

    expect(small.scale / 0.5).toBeCloseTo(large.scale / 2, 6)
  })

  it('大きく回しても倍率が 0 以下にならない', () => {
    const after = applyWheel(START, wheel({ deltaY: 100000, ctrlKey: true }))

    expect(after.scale).toBeGreaterThan(0)
  })

  it('上下限を超えない', () => {
    const tooBig = applyWheel(START, wheel({ deltaY: -100000, ctrlKey: true }))
    const tooSmall = applyWheel(START, wheel({ deltaY: 100000, ctrlKey: true }))

    expect(tooBig.scale).toBe(MAX_SCALE)
    expect(tooSmall.scale).toBe(MIN_SCALE)
  })

  it('Shift を足しても、拡大縮小のほうが勝つ', () => {
    // 修飾キーが重なったときに、横移動と拡大縮小が同時に起きない
    const after = applyWheel(START, wheel({ deltaY: -50, ctrlKey: true, shiftKey: true }))

    expect(after.scale).toBeGreaterThan(START.scale)
  })
})

describe('どちらの操作か（UT-16）', () => {
  it.each([
    ['ctrl', { ctrlKey: true, metaKey: false }, true],
    ['meta', { ctrlKey: false, metaKey: true }, true],
    ['修飾なし', { ctrlKey: false, metaKey: false }, false],
  ])('%s', (_label, keys, expected) => {
    expect(isZoomGesture(keys)).toBe(expected)
  })
})
