import { describe, expect, it } from 'vitest'

import { draggedTo, DRAG_THRESHOLD, isDrag, type DragStart } from './node-drag'

const START: DragStart = {
  nodeId: 'file:src/a.ts',
  pointer: { x: 200, y: 150 },
  origin: { x: 40, y: 80 },
}

describe('押しただけか、動かしたか（US-17 / UT-14）', () => {
  it('しきい値より小さい動きは、押しただけ', () => {
    // 手の震えで選択が動かせなくなると、クリックで選べない
    expect(isDrag(START.pointer, { x: 202, y: 151 })).toBe(false)
  })

  it('しきい値を超えたら、動かした', () => {
    expect(isDrag(START.pointer, { x: 200 + DRAG_THRESHOLD, y: 150 })).toBe(true)
  })

  it('斜めの動きも距離で測る', () => {
    // 軸ごとに見ると、斜めに動かしたときだけしきい値が √2 倍になる
    expect(isDrag(START.pointer, { x: 203, y: 153 })).toBe(true)
  })

  it('倍率に関わらず、画面の距離で測る', () => {
    // 図の座標で測ると、縮小しているほど小さな手の動きでドラッグになる
    expect(isDrag({ x: 0, y: 0 }, { x: DRAG_THRESHOLD - 1, y: 0 })).toBe(false)
    expect(isDrag({ x: 0, y: 0 }, { x: DRAG_THRESHOLD, y: 0 })).toBe(true)
  })
})

describe('動かした先（US-17）', () => {
  it('掴んだ位置から、動かしたぶんだけずれる', () => {
    const after = draggedTo(START, { x: 260, y: 130 }, 1)

    expect(after).toEqual({ x: 100, y: 60 })
  })

  it('拡大しているときは、図の座標での移動が小さくなる', () => {
    // 割らないと、ノードがポインタより速く動いて掴んだ場所から離れる
    const after = draggedTo(START, { x: 300, y: 150 }, 2)

    expect(after).toEqual({ x: 40 + 50, y: 80 })
  })

  it('縮小しているときは、図の座標での移動が大きくなる', () => {
    const after = draggedTo(START, { x: 300, y: 150 }, 0.5)

    expect(after).toEqual({ x: 40 + 200, y: 80 })
  })

  it('掴んだ時点を基準にする。足し込まない', () => {
    // 毎回の差を足すと、動かすほど誤差が積み上がる
    const once = draggedTo(START, { x: 500, y: 400 }, 1)
    const stepped = [
      draggedTo(START, { x: 300, y: 250 }, 1),
      draggedTo(START, { x: 400, y: 300 }, 1),
      draggedTo(START, { x: 500, y: 400 }, 1),
    ].at(-1)!

    expect(stepped).toEqual(once)
  })

  it('動かさなければ、元の位置のまま', () => {
    expect(draggedTo(START, START.pointer, 1)).toEqual(START.origin)
  })
})
