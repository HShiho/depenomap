import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { LABEL_GEOMETRY } from './node-label'

/**
 * 幅の見積もりが、トークンの値からずれていないことの検査（UT-10）。
 *
 * 見出しと印は同じ行に並ぶ。図は実寸を測れる場所ではない（SVG のテキストは
 * 描画後にしか測れず、測ってから並べ直すと図が揺れる）ので、寸法を TS 側に
 * 写して見積もっている。**写しである以上、正のほうが動けばずれる。** ずれても
 * 画面が壊れるだけで、どのテストも落ちない — ここで突き合わせる。
 *
 * Node の API を使うので `.node.test.ts`（サーバー側の tsconfig が型検査する）。
 */
const tokensCss = readFileSync(
  fileURLToPath(new URL('../design/tokens.css', import.meta.url)),
  'utf8',
)

function pxOf(token: string): number {
  const found = new RegExp(`${token}:\\s*([\\d.]+)px`).exec(tokensCss)
  expect(found, `トークンが無い: ${token}`).not.toBeNull()
  return Number(found![1])
}

describe('幅の見積もりとトークン（UT-10）', () => {
  it('印の 1 文字ぶんが、印の文字サイズと一致する', () => {
    // 出すのは全角の語だけなので、送りは文字サイズと同じ
    expect(LABEL_GEOMETRY.FLAG_CHAR_WIDTH).toBe(pxOf('--text-flag'))
  })

  it('見出しの 1 文字ぶんが、見出しの文字サイズから出た値と一致する', () => {
    // 等幅の送りは 0.6em（`--font-mono`）
    expect(LABEL_GEOMETRY.NAME_CHAR_WIDTH).toBeCloseTo(pxOf('--text-ui') * 0.6, 5)
  })
})
