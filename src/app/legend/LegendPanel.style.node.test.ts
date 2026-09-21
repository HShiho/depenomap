import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * 凡例の見本が、**図と同じトークンで描かれている**ことの検査（UT-26）。
 *
 * 図の線の規則は `GraphCanvas.vue` の scoped CSS にあり、凡例からは使えない。
 * そこで同じトークンを引いて描いているが、**片方だけ変えても誰も気付かない**。
 * ここで両方のソースを読み、種別ごとに使っているトークンの集合を突き合わせる。
 *
 * 見るのはトークン名であって、値でも見た目でもない。値はテーマが決める。
 *
 * Node の API を使うので `.node.test.ts`（サーバー側の tsconfig が型検査する）。
 */
const legend = readFileSync(fileURLToPath(new URL('./LegendPanel.vue', import.meta.url)), 'utf8')
const canvas = readFileSync(
  fileURLToPath(new URL('../graph-canvas/GraphCanvas.vue', import.meta.url)),
  'utf8',
)

const styleOf = (source: string): string => source.slice(source.indexOf('<style'))

/**
 * そのセレクタの規則が使っているトークン名。
 *
 * **セレクタと中身はソースから取る。** テストに書いた文字列どうしを比べても、
 * 実装が何を書いているかは分からない。
 */
function tokensOf(source: string, selector: string): string[] {
  const style = styleOf(source)
  const at = style.indexOf(selector)
  expect(at, `規則が無い: ${selector}`).toBeGreaterThan(-1)

  const body = style.slice(at, style.indexOf('}', at))
  return [...body.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]!).sort()
}

describe('凡例の見本と図の対応（UT-26）', () => {
  it.each([
    ['確定した依存', '.sample {', '.edge {'],
    ['implements', '.sample.implements', '.edge.implements'],
    ['interface 経由', '.sample.via', '.edge.via'],
    ['中点の印', '.sample-dot', '.via-dot'],
  ])('%s は、図と同じトークンで描く', (_label, legendSelector, canvasSelector) => {
    expect(tokensOf(legend, legendSelector)).toEqual(tokensOf(canvas, canvasSelector))
  })

  it('中点の控えの半径も、図と同じ値を置く', () => {
    /*
     * 半径は CSS のジオメトリプロパティで取るが、対応していないブラウザでは
     * 属性側の控えが効く（`GraphCanvas.vue` のコメント）。**凡例だけ控えが
     * 無いと、説明したいその印が凡例からだけ消える。** 値はソースから取る
     */
    const radiusOf = (source: string) => source.match(/r="([\d.]+)"/)?.[1]

    expect(radiusOf(legend)).toBeDefined()
    expect(radiusOf(legend)).toBe(radiusOf(canvas))
  })

  it('循環の線も、図と同じトークンで描く', () => {
    /*
     * 図の側は複合セレクタ（`.edge.cyclic, .edge.via.cyclic, ...`）で詳細度を
     * 上げている（UT-10）。凡例は重ならないので単独のセレクタだが、**使う
     * トークンは同じでなければならない**
     */
    expect(tokensOf(legend, '.sample.cyclic')).toEqual(tokensOf(canvas, '.edge.cyclic,'))
  })
})
