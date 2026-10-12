import { describe, expect, it } from 'vitest'

import {
  buildNavIndex,
  focusAfterRebuild,
  gridPositionOf,
  nextFocus,
  type NavNode,
} from './keyboard-nav'

/*
 *   列 0      列 2（列 1 は空で詰められている）   列 5
 *   a (y=0)   d (y=0)                            g (y=100)
 *   b (y=100) e (y=180)
 *   c (y=200)
 */
const nodes: NavNode[] = [
  { id: 'c', column: 0, y: 200 },
  { id: 'a', column: 0, y: 0 },
  { id: 'b', column: 0, y: 100 },
  { id: 'e', column: 2, y: 180 },
  { id: 'd', column: 2, y: 0 },
  { id: 'g', column: 5, y: 100 },
]
const index = buildNavIndex(nodes)

describe('矢印キーでの移動（UT-21）', () => {
  it('↑↓ は列の中を、縦の位置の順に動く', () => {
    expect(nextFocus(index, 'a', 'ArrowDown')).toBe('b')
    expect(nextFocus(index, 'b', 'ArrowDown')).toBe('c')
    expect(nextFocus(index, 'c', 'ArrowUp')).toBe('b')
  })

  it('列の端では止まる（反対側へ回り込まない）', () => {
    expect(nextFocus(index, 'c', 'ArrowDown')).toBe('c')
    expect(nextFocus(index, 'a', 'ArrowUp')).toBe('a')
  })

  it('←→ は隣の列へ。縦の位置が一番近いノードに移る', () => {
    expect(nextFocus(index, 'c', 'ArrowRight')).toBe('e')
    expect(nextFocus(index, 'a', 'ArrowRight')).toBe('d')
    expect(nextFocus(index, 'e', 'ArrowLeft')).toBe('c')
  })

  it('空の列は飛ばす（列番号が離れていても、隣に描かれている列へ）', () => {
    expect(nextFocus(index, 'd', 'ArrowRight')).toBe('g')
    expect(nextFocus(index, 'g', 'ArrowLeft')).toBe('e')
  })

  it('一番端の列では止まる', () => {
    expect(nextFocus(index, 'a', 'ArrowLeft')).toBe('a')
    expect(nextFocus(index, 'g', 'ArrowRight')).toBe('g')
  })

  it('Home / End は列の先頭・末尾へ', () => {
    expect(nextFocus(index, 'b', 'Home')).toBe('a')
    expect(nextFocus(index, 'b', 'End')).toBe('c')
  })

  it('焦点が図に無ければ、先頭（左の列の一番上）から始める', () => {
    expect(nextFocus(index, undefined, 'ArrowDown')).toBe('a')
    expect(nextFocus(index, 'gone', 'ArrowRight')).toBe('a')
  })

  it('図にノードが無ければ、どこにも動かない', () => {
    expect(nextFocus(buildNavIndex([]), 'a', 'ArrowDown')).toBeUndefined()
  })

  it('縦の位置が同じなら、同じ距離のうち上を選ぶ（揺れない）', () => {
    const tie: NavNode[] = [
      { id: 'x', column: 0, y: 50 },
      { id: 'up', column: 1, y: 0 },
      { id: 'down', column: 1, y: 100 },
    ]
    expect(nextFocus(buildNavIndex(tie), 'x', 'ArrowRight')).toBe('up')
  })
})

describe('図が組み換わったときの焦点の行き先（UT-21）', () => {
  it('直前に焦点を当てていたノードが残っていれば、そのまま', () => {
    expect(focusAfterRebuild(index, 'e', 'b')).toBe('e')
  })

  it('消えていれば、選択中のノード', () => {
    expect(focusAfterRebuild(index, 'gone', 'b')).toBe('b')
  })

  it('選択も図に無ければ、先頭', () => {
    expect(focusAfterRebuild(index, 'gone', 'also-gone')).toBe('a')
    expect(focusAfterRebuild(index, undefined, undefined)).toBe('a')
  })

  it('図にノードが無ければ、行き先は無い', () => {
    expect(focusAfterRebuild(buildNavIndex([]), 'a', 'b')).toBeUndefined()
  })
})

describe('読み上げに出す位置（UT-21）', () => {
  it('何列目の何番目かを、描かれている列だけで数える', () => {
    expect(gridPositionOf(index, 'e')).toEqual({ column: 2, columns: 3, row: 2, rows: 2 })
    expect(gridPositionOf(index, 'g')).toEqual({ column: 3, columns: 3, row: 1, rows: 1 })
  })

  it('図に無いノードは位置を持たない', () => {
    expect(gridPositionOf(index, 'gone')).toBeUndefined()
  })
})
