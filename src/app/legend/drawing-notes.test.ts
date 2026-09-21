import { describe, expect, it } from 'vitest'

import { emptyNoteOf, viaNoteOf } from './drawing-notes'

describe('インターフェース経由の断り（UT-26 / UT-07）', () => {
  it('メソッド粒度では、解決した本数を言う', () => {
    // 呼び出し元 → interface → 実装 の 2 本は図に無い（UT-07）
    expect(viaNoteOf({ granularity: 'method', viaCount: 12 })).toContain('12')
  })

  it('ファイル粒度では、ここでは見えないことを言う', () => {
    const note = viaNoteOf({ granularity: 'file', viaCount: 12 })

    expect(note).toContain('メソッド粒度')
    expect(note).not.toContain('12')
  })

  it('1 本も無ければ、何も言わない', () => {
    // 断ること自体が無いグラフで場所を取らない
    expect(viaNoteOf({ granularity: 'method', viaCount: 0 })).toBeUndefined()
    expect(viaNoteOf({ granularity: 'file', viaCount: 0 })).toBeUndefined()
  })
})

describe('図が空であることの断り（UT-26）', () => {
  it('出ていれば何も言わない', () => {
    expect(emptyNoteOf({ shown: 3, narrowed: false, inGranularity: 10 })).toBeUndefined()
  })

  it('絞り込んだ結果なら、そう言う', () => {
    // 解けば戻ると分かる
    const note = emptyNoteOf({ shown: 0, narrowed: true, inGranularity: 10 })

    expect(note).toContain('絞り込')
  })

  it('その粒度にノードが無いなら、そう言う', () => {
    // メソッドを 1 つも持たない正本 JSON でメソッド粒度にしたとき
    const note = emptyNoteOf({ shown: 0, narrowed: false, inGranularity: 0 })

    expect(note).toContain('粒度')
    expect(note).not.toContain('絞り込')
  })

  it('理由が分からないときも、空であることは言う', () => {
    const note = emptyNoteOf({ shown: 0, narrowed: false, inGranularity: 10 })

    expect(note).toBeDefined()
    expect(note).not.toContain('絞り込')
    expect(note).not.toContain('粒度')
  })

  it('欠陥として扱わない（N-1）', () => {
    const notes = [
      emptyNoteOf({ shown: 0, narrowed: true, inGranularity: 10 }),
      emptyNoteOf({ shown: 0, narrowed: false, inGranularity: 0 }),
      viaNoteOf({ granularity: 'method', viaCount: 3 }),
    ]

    for (const note of notes) {
      for (const word of ['エラー', '警告', '問題', '違反', '失敗']) {
        expect(note).not.toContain(word)
      }
    }
  })
})
