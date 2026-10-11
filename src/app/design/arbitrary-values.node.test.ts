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
 * トークンの参照は `(--token)` 記法で書く（`max-w-(--panel-width)`）。変数を書く
 * ための記法だが、フォールバック（`(--x,900px)`）を付けると直値が入るので、それも拾う。
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
 * テンプレートに書かれたクラス名。
 *
 * 静的な `class="..."` と、`:class="..."` の中の文字列リテラルから取り、空白で
 * 切り出す。**形を正規表現 1 本で当てない** — 変種を前に付ける（`[&>svg]:size-[9px]`）、
 * 修飾子に書く（`bg-ground/[0.5]`）といった書き方ごとに抜け道ができる。クラス名を
 * 1 語ずつ取り出してから判定すれば、どこに書いても同じ規則で見られる。
 *
 * `:class` の式そのもの（配列の `[`、`nodes[0]` のような添字）は、文字列リテラルの
 * 外にあるので拾わない。
 */
function classNamesOf(template: string): string[] {
  const values: string[] = []
  for (const match of template.matchAll(/(?<![\w:.-])class="([^"]*)"/g)) values.push(match[1]!)
  for (const match of template.matchAll(/(?::|v-bind:)class="([^"]*)"/g)) {
    for (const literal of match[1]!.matchAll(/'([^']*)'|`([^`]*)`/g)) {
      values.push(literal[1] ?? literal[2] ?? '')
    }
  }
  return values.flatMap((value) => value.split(/\s+/)).filter((name) => name !== '')
}

/**
 * 任意値記法のクラス名か。**`[` を含むか、`(--token)` にフォールバックを書いたもの**。
 *
 * 値（`w-[180px]`）、修飾子（`/[0.5]`）、プロパティ（`[color:#f00]`）、変種
 * （`[&>svg]:`、`[@media(...)]:`）のどれも `[` を通る。名前で呼べるクラスは `[` を
 * 持たないので、誤って拾うものが無い。
 *
 * `(--token)` 記法は var() の第 2 引数をそのまま通す。`max-w-(--x,900px)` は
 * `max-width: var(--x,900px)` になり、直値が入る。括弧の中にカンマがあれば拾う。
 */
function isArbitrary(name: string): boolean {
  return name.includes('[') || /\(--[^)]*,/.test(name)
}

function findArbitrary(template: string): string[] {
  return classNamesOf(template).filter(isArbitrary)
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

  it('修飾子に書いた任意値も拾う', () => {
    // `/70` は不透明度の段階だが、`/[0.5]` や `/[20px]` は直値の CSS になる
    expect(findArbitrary('<div class="bg-ground/[0.5] text-meta/[20px] bg-ground/70">')).toEqual([
      'bg-ground/[0.5]',
      'text-meta/[20px]',
    ])
  })

  it('任意の変種を前に付けても拾う', () => {
    // 変種を 1 つ付けるだけで素通りできる形にしない。変種自体が直値を持つ形も拾う
    expect(
      findArbitrary(
        '<div class="[&>svg]:size-9 hover:[&>svg]:size-[9px] [@media(min-width:900px)]:flex">',
      ),
    ).toEqual(['[&>svg]:size-9', 'hover:[&>svg]:size-[9px]', '[@media(min-width:900px)]:flex'])
  })

  it('(--token) 記法にフォールバックの直値を書いたものも拾う', () => {
    /*
     * `(--token)` は var() の第 2 引数をそのまま通すので、`max-w-(--x,900px)` は
     * `max-width: var(--x,900px)` になる。規則が勧める書き方そのものを抜け道にしない
     */
    expect(
      findArbitrary('<div class="max-w-(--x,900px) bg-(--nope,#ff0000) max-w-(--panel-width)">'),
    ).toEqual(['max-w-(--x,900px)', 'bg-(--nope,#ff0000)'])
  })

  it('プロパティ名の大文字小文字を問わず拾う', () => {
    expect(findArbitrary('<div class="[Color:#f00]">')).toEqual(['[Color:#f00]'])
  })

  it(':class に書いた文字列の中も拾う。式の添字や配列は拾わない', () => {
    expect(
      findArbitrary(
        "<p :class=\"[cyclic ? 'w-[9px] text-ink' : 'p-9', { selected }]\">{{ nodes[0] }}</p>",
      ),
    ).toEqual(['w-[9px]'])
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
