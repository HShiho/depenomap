import { describe, expect, it } from 'vitest'

import type { Unresolved } from '@/core/graph/schema'
import { candidateSummaryOf, readingOf } from './unresolved-label'

const unresolved = (candidates: string[]): Unresolved => ({
  id: 'u_0001',
  reason: 'callback',
  from: 'method:src/a.ts#f',
  expression: 'cb()',
  candidates,
})

describe('理由の読み替え（US-21）', () => {
  it.each([
    ['dynamic-di-token', 'DI コンテナの文字列トークン'],
    ['dynamic-import', '動的 import'],
    ['callback', 'コールバック経由の呼び出し'],
    ['dynamic-property', '動的なプロパティ参照'],
  ])('%s を日本語で示す', (reason, expected) => {
    expect(readingOf(reason)).toBe(expected)
  })

  it('知らないコードは、そのまま出す', () => {
    // 「その他」に丸めると、正本 JSON が言っていることが画面から消える
    expect(readingOf('brand-new-reason')).toBe('brand-new-reason')
  })

  it('是正を促す言葉を出さない（N-1）', () => {
    const readings = ['dynamic-di-token', 'dynamic-import', 'callback', 'dynamic-property'].map(
      readingOf,
    )

    for (const word of ['違反', 'エラー', '警告', '修正', '直', '避け']) {
      expect(readings.join(' ')).not.toContain(word)
    }
  })
})

describe('候補の言い方（US-21）', () => {
  it('候補があるときは、推測であることを言う', () => {
    expect(candidateSummaryOf(unresolved(['method:src/b.ts#g']))).toBe('推測した行き先 1 件')
  })

  it('候補が無くても破綻しない', () => {
    // 絞り込めなかったこと自体が事実
    expect(candidateSummaryOf(unresolved([]))).toBe('行き先の候補は絞り込めていません')
  })

  it('候補を確定した依存として言わない', () => {
    const shown = [candidateSummaryOf(unresolved([])), candidateSummaryOf(unresolved(['x']))]

    for (const word of ['依存先', '呼び出している', '確定']) {
      expect(shown.join(' ')).not.toContain(word)
    }
  })
})
