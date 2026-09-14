import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * 見た目の強弱が、**規則を書いた順ではなく詳細度で決まっている**ことの検査
 * （UT-10）。
 *
 * 循環・選択・経由は同じ要素に同時に当たる。同値の詳細度で並べると、規則を
 * 並べ替えただけで勝ち負けが入れ替わり、その場では誰も気付かない。描画結果で
 * 確かめられないのは、テストが scoped CSS を適用しないため。**ここで見るのは
 * 規則の形**であり、色そのものではない。
 *
 * Node の API を使うので `.node.test.ts`（サーバー側の tsconfig が型検査する）。
 */
const source = readFileSync(fileURLToPath(new URL('./GraphCanvas.vue', import.meta.url)), 'utf8')
const style = source.slice(source.indexOf('<style'))

/** セレクタの詳細度（クラスの数だけ数えれば足りる） */
function classCount(selector: string): number {
  return selector.split('.').length - 1
}

/** そのセレクタを持つ規則の本文 */
function ruleFor(selector: string): string {
  const at = style.indexOf(selector)
  expect(at, `規則が無い: ${selector}`).toBeGreaterThan(-1)
  return style.slice(at, style.indexOf('}', at))
}

describe('重なったときの強弱（UT-10）', () => {
  it('選択と循環が重なるノードは、選択の色で描く', () => {
    // 選択は操作の状態で、いま何を選んでいるかが読めないと操作が続かない
    const rule = ruleFor('.node.selected.in-cycle .box')

    expect(rule).toContain('var(--color-accent)')
    expect(classCount('.node.selected.in-cycle .box')).toBeGreaterThan(
      classCount('.node.in-cycle .box'),
    )
  })

  it('選択中でも破線は残る', () => {
    // 破線を消す指定を足すと、選択しているあいだ循環が読めなくなる
    expect(ruleFor('.node.selected.in-cycle .box')).not.toContain('stroke-dasharray')
  })

  it('経由と循環が重なる辺は、循環の色で描く', () => {
    // どの辺をたどると戻ってくるのかが読めなくなるため
    const rule = ruleFor('.edge.via.cyclic')

    expect(rule).toContain('var(--color-warn)')
    expect(classCount('.edge.via.cyclic')).toBeGreaterThan(classCount('.edge.via'))
  })

  it('実装の対応と循環が重なる辺も、循環の色で描く', () => {
    expect(ruleFor('.edge.implements.cyclic')).toContain('var(--color-warn)')
    expect(classCount('.edge.implements.cyclic')).toBeGreaterThan(classCount('.edge.implements'))
  })
})
