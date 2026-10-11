import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * 任意値記法を画面のコードに持ち込ませない（UT-23 / QR-3）。
 *
 * `tokens.css` が塞げるのは Tailwind の名前付きの既定値までで、`p-[9px]` や
 * `bg-[#fff]` のような任意値記法はそのまま CSS になる。直値と同じものだが
 * ツールでは止まらず、「レビューで見る」としていたあいだに UT ごとに少しずつ
 * 増えた。ここで機械的に止める。
 *
 * トークンの参照は `(--token)` 記法で書く（`max-w-(--panel-width)`）。変数しか
 * 書けない記法なので、直値が入り込めない。
 *
 * 見るのは `.vue` の `<template>` だけ。クラスを書いているのはそこだけで、
 * スクリプトの `nodes[0]` のような添字を誤って拾わない。HTML コメントも除く
 * （規則の説明に例として書いた `bg-[#fff]` を拾わない）。
 */

const appDir = fileURLToPath(new URL('..', import.meta.url))

/** `src/app` 以下の `.vue` を集める */
function vueFiles(): string[] {
  return readdirSync(appDir, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.vue'))
    .map((path) => join(appDir, path))
}

/** `<template>` の中身から HTML コメントを除いたもの。テンプレートが無ければ空 */
function templateOf(source: string): string {
  const start = source.indexOf('<template')
  const end = source.lastIndexOf('</template>')
  if (start === -1 || end === -1) return ''
  return source.slice(start, end).replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * 任意値記法の形。
 *
 *   - 値: `w-[180px]` / `bg-[#fff]` / `max-w-[var(--x)]`（ユーティリティ名の直後の `-[`）
 *   - プロパティ: `[mask-type:luminance]`（`[` で始まり `プロパティ:` が続く）
 *
 * クラス名の区切り（空白・引用符）から拾い、報告にクラス名全体（変種込み）を出す。
 */
const ARBITRARY = /(?<=^|[\s"'`])(?:[\w:!./()-]*?-\[[^\]\s]*\]|\[[a-z-]+:[^\]\s]*\])/g

function findArbitrary(template: string): string[] {
  return [...template.matchAll(ARBITRARY)].map((match) => match[0])
}

describe('任意値記法を持ち込まない（UT-23）', () => {
  it('検出の形が、任意値記法を拾い、トークン参照と添字は拾わない', () => {
    // 検出が空振りしていると、下の検査は何も見ずに通る
    expect(findArbitrary('<div class="w-[180px] bg-[#fff] p-9">')).toEqual([
      'w-[180px]',
      'bg-[#fff]',
    ])
    expect(findArbitrary('<div class="max-w-[var(--panel-width)]">')).toEqual([
      'max-w-[var(--panel-width)]',
    ])
    expect(findArbitrary('<div class="[mask-type:luminance]">')).toEqual(['[mask-type:luminance]'])
    expect(findArbitrary('<div class="max-w-(--panel-width) hover:bg-surface-2">')).toEqual([])
    expect(findArbitrary('<p :class="[edge.variant, { cyclic }]">{{ nodes[0] }}</p>')).toEqual([])
  })

  it('HTML コメントの中の例は拾わない', () => {
    expect(findArbitrary(templateOf('<template><!-- bg-[#fff] は書かない --></template>'))).toEqual(
      [],
    )
  })

  it('画面のテンプレートに任意値記法が無い', () => {
    const files = vueFiles()
    // 走査の対象が空なら、何も見ずに通ってしまう
    expect(files.length).toBeGreaterThan(20)

    const found = files.flatMap((file) =>
      findArbitrary(templateOf(readFileSync(file, 'utf8'))).map(
        (hit) => `${relative(appDir, file)}: ${hit}`,
      ),
    )

    // 置き換えられないなら、トークンを足して名前で呼ぶ（design/README.md「トークンを足す基準」）
    expect(found).toEqual([])
  })
})
