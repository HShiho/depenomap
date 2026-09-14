import { describe, expect, it } from 'vitest'

import { COMMIT_DIGITS, formatGeneratedAt, percentOf, shortCommit } from './overview-format'

describe('commit の短縮（US-11）', () => {
  it('先頭から決まった桁だけ出す', () => {
    expect(shortCommit('7c1e40b9a2d8f3e6b5104c7a9d2e8f1b6350ac47')).toBe('7c1e40b')
    expect(shortCommit('7c1e40b9a2d8f3e6b5104c7a9d2e8f1b6350ac47')).toHaveLength(COMMIT_DIGITS)
  })

  it('桁に満たなければ、あるぶんだけ返す', () => {
    // 抽出側が何を入れてくるかはビューアの保証の外
    expect(shortCommit('abc')).toBe('abc')
    expect(shortCommit('')).toBe('')
  })
})

describe('生成日時の書式（US-11）', () => {
  it('ISO 8601 を読みやすい表記にする', () => {
    const shown = formatGeneratedAt('2026-08-23T04:18:52.106Z')

    expect(shown).not.toBe('2026-08-23T04:18:52.106Z')
    expect(shown).toContain('2026')
  })

  it('解釈できない文字列は、そのまま返す', () => {
    // 捨てると、素性を確かめにきた読み手から情報が消える
    expect(formatGeneratedAt('いつか')).toBe('いつか')
    expect(formatGeneratedAt('')).toBe('')
  })
})

describe('構成比（US-11）', () => {
  it('全体に占める割合を返す', () => {
    expect(percentOf(1, 4)).toBe(25)
    expect(percentOf(4, 4)).toBe(100)
  })

  it('母数が 0 でも破綻しない', () => {
    // ノードが 1 件も無いグラフでも構成比の表示が壊れない（完了条件）
    expect(percentOf(0, 0)).toBe(0)
    expect(Number.isNaN(percentOf(0, 0))).toBe(false)
  })
})
