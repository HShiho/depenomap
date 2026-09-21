import { describe, expect, it } from 'vitest'

import { emptyNoteOf, viaNoteOf } from './drawing-notes'

describe('インターフェース経由の断り（UT-26 / UT-07）', () => {
  it('メソッド粒度では、描いている本数を言う', () => {
    // 行き先はインターフェース。実装へは implements の線でたどる（UT-07）
    const note = viaNoteOf({ granularity: 'method', totalVia: 12, drawnVia: 5 })

    expect(note).toContain('5')
    expect(note).not.toContain('12')
  })

  it('行き先が実装であるかのように言わない', () => {
    /*
     * UT-07 は**インターフェース宛に描く**と決めている（実装へは implements の
     * 線でたどる）。「実装へ解決して描いています」は、図が描いていないことを
     * 断言することになる
     */
    const note = viaNoteOf({ granularity: 'method', totalVia: 12, drawnVia: 5 })

    expect(note).toContain('インターフェース宛')
    expect(note).not.toContain('実装へ解決')
  })

  it('絞り込んで 1 本も出ていなければ、何も言わない', () => {
    // 「描いています」と言う以上、描いていないものを数に入れない
    expect(viaNoteOf({ granularity: 'method', totalVia: 12, drawnVia: 0 })).toBeUndefined()
  })

  it('ファイル粒度では、どこで見えるかを言う', () => {
    // 経由かどうかの区別が、この粒度では図に出ない
    const note = viaNoteOf({ granularity: 'file', totalVia: 12, drawnVia: 0 })

    expect(note).toContain('メソッド粒度')
    expect(note).not.toContain('12')
  })

  it('グラフ全体に 1 本も無ければ、何も言わない', () => {
    // 断ること自体が無いグラフで場所を取らない
    expect(viaNoteOf({ granularity: 'method', totalVia: 0, drawnVia: 0 })).toBeUndefined()
    expect(viaNoteOf({ granularity: 'file', totalVia: 0, drawnVia: 0 })).toBeUndefined()
  })
})

describe('図が空であることの断り（UT-26）', () => {
  it('出ていれば何も言わない', () => {
    expect(emptyNoteOf({ shown: 3, inGranularity: 10 })).toBeUndefined()
  })

  it('その粒度にノードが無いなら、そう言う', () => {
    // メソッドを 1 つも持たない正本 JSON で、メソッド粒度にしたとき
    expect(emptyNoteOf({ shown: 0, inGranularity: 0 })).toContain('粒度')
  })

  it('理由が分からないときも、空であることは言う', () => {
    const note = emptyNoteOf({ shown: 0, inGranularity: 10 })

    expect(note).toBeDefined()
    expect(note).not.toContain('粒度')
  })

  it('欠陥として扱わない（N-1）', () => {
    const notes = [
      emptyNoteOf({ shown: 0, inGranularity: 0 }),
      emptyNoteOf({ shown: 0, inGranularity: 10 }),
      viaNoteOf({ granularity: 'method', totalVia: 3, drawnVia: 3 }),
    ]

    for (const note of notes) {
      for (const word of ['エラー', '警告', '問題', '違反', '失敗']) {
        expect(note).not.toContain(word)
      }
    }
  })
})
