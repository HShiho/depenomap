import { describe, expect, it } from 'vitest'

import { menuPositionOf } from './menu-position'

const menu = { width: 240, height: 100 }
const viewport = { width: 1000, height: 800 }

describe('右クリックメニューを出す位置（UT-18）', () => {
  it('押した場所に出す', () => {
    expect(menuPositionOf({ x: 300, y: 200 }, menu, viewport)).toEqual({ x: 300, y: 200 })
  })

  it('右端で押されたら、収まる側へ寄せる', () => {
    // はみ出した分は読めず、項目に届かない
    expect(menuPositionOf({ x: 980, y: 200 }, menu, viewport).x).toBe(1000 - 240 - 8)
  })

  it('下端で押されたら、上へ寄せる', () => {
    expect(menuPositionOf({ x: 300, y: 790 }, menu, viewport).y).toBe(800 - 100 - 8)
  })

  it('左上の縁でも、縁に貼り付けない', () => {
    // 角が切れて読みにくい
    expect(menuPositionOf({ x: 0, y: 0 }, menu, viewport)).toEqual({ x: 8, y: 8 })
  })

  it('画面より大きいときは、先頭側を残す', () => {
    // 両端には収まらない。少なくとも最初の項目には届くようにする
    const tiny = { width: 100, height: 60 }

    expect(menuPositionOf({ x: 50, y: 30 }, menu, tiny)).toEqual({ x: 8, y: 8 })
  })

  it('まだ測れていない（大きさ 0）でも、押した場所を返す', () => {
    // 出す前に大きさは分からない。測れるまでのあいだも位置は要る
    expect(menuPositionOf({ x: 300, y: 200 }, { width: 0, height: 0 }, viewport)).toEqual({
      x: 300,
      y: 200,
    })
  })
})
