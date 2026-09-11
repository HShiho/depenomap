import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

// Tailwind のプラグインが CSS の取り込みを横取りするため、ファイルとして読む。
// Node の API を使うので **.node.test.ts**（サーバー側の tsconfig が型検査する）
const tokensCss = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

/**
 * トークンの定義が「片方のモードにしか無い」状態を防ぐための検査。
 *
 * ここが守っているのは UT-04 の完了条件そのもので、目視では守れない。
 * ライトは `@theme`、ダークは 2 か所（OS 追従用と明示選択用）に分かれており、
 * 足すときに 1 か所書き忘れても、その場では画面が壊れないためである。
 */

/**
 * `{` と `}` の対応を数えて、開き括弧の位置から 1 ブロック分を切り出す。
 *
 * 目印は正規表現で受ける。同じ文字列（`@media (prefers-color-scheme: dark)` など）が
 * `@custom-variant` の中にも出てくるため、行頭に置かれているものだけを狙う。
 */
function blockAfter(marker: RegExp): string {
  const start = marker.exec(tokensCss)?.index ?? -1
  if (start === -1) throw new Error(`見つからない: ${marker}`)

  const open = tokensCss.indexOf('{', start)
  let depth = 0
  for (let i = open; i < tokensCss.length; i++) {
    if (tokensCss[i] === '{') depth++
    else if (tokensCss[i] === '}') {
      depth--
      if (depth === 0) return tokensCss.slice(open + 1, i)
    }
  }
  throw new Error(`閉じていない: ${marker}`)
}

/** ブロック内の `--name: value` を集める。ネストしたブロックの中身も拾う */
function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1]!, match[2]!.trim())
  }
  return found
}

/** 色を持たない指定（`transparent` など）と、既定値を消すための宣言は対象外 */
function colorTokens(declared: Map<string, string>): string[] {
  const excluded = new Set(['--color-transparent', '--color-current', '--color-inherit'])
  return [...declared.keys()]
    .filter((name) => name.startsWith('--color-'))
    .filter((name) => !name.endsWith('-*') && !excluded.has(name))
    .sort()
}

const theme = declarations(blockAfter(/^@theme static/m))
const darkBySystem = declarations(blockAfter(/^@media \(prefers-color-scheme: dark\)/m))
const darkByChoice = declarations(blockAfter(/^:root\[data-theme='dark'\]/m))

describe('ライトとダークのトークン', () => {
  it('OS 追従のダークが、ライトの色をすべて置き換える', () => {
    expect(colorTokens(darkBySystem)).toEqual(colorTokens(theme))
  })

  it('明示選択のダークが、ライトの色をすべて置き換える', () => {
    expect(colorTokens(darkByChoice)).toEqual(colorTokens(theme))
  })

  it('2 つのダークは同じ値を持つ', () => {
    for (const [name, value] of darkBySystem) {
      expect([name, darkByChoice.get(name)]).toEqual([name, value])
    }
    expect([...darkByChoice.keys()].sort()).toEqual([...darkBySystem.keys()].sort())
  })

  it('検査対象が空でない（regex が空振りしていない）', () => {
    expect(colorTokens(theme).length).toBeGreaterThanOrEqual(16)
  })
})

describe('ユーティリティを持たない変数', () => {
  const raw = declarations(blockAfter(/^:root \{/m))

  it.each(['--tint', '--shadow-float'])('%s が両モードで定義されている', (name) => {
    expect(raw.has(name)).toBe(true)
    expect(darkBySystem.has(name)).toBe(true)
    expect(darkByChoice.has(name)).toBe(true)
  })

  it('SVG 用の変数は明暗で変わらないので、ライト側にだけある', () => {
    expect(raw.has('--edge-stroke')).toBe(true)
    expect(darkBySystem.has('--edge-stroke')).toBe(false)
  })
})

describe('SVG のジオメトリに控えを置いている値', () => {
  /**
   * `r` は CSS のジオメトリプロパティ経由でしかトークンを参照できず、
   * 未対応ブラウザ向けに属性側へ同じ値を控えとして書いている（UT-07）。
   * 出所が 2 つあるので、ずれていないことをここで見る。
   */
  it('経由の印の半径が、トークンと属性で一致する', () => {
    const canvas = readFileSync(
      fileURLToPath(new URL('../graph-canvas/GraphCanvas.vue', import.meta.url)),
      'utf8',
    )

    const token = /--via-dot-radius:\s*([\d.]+)px/.exec(tokensCss)?.[1]
    const attribute = /<circle[^>]*class="via-dot"[\s\S]*?r="([\d.]+)"/.exec(canvas)?.[1]

    expect(token).toBeDefined()
    expect(attribute).toBeDefined()
    expect(Number(attribute)).toBe(Number(token))
  })
})
