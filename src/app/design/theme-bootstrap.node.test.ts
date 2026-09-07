import { createContext, runInContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

import viteConfig from '../../../vite.config'
import { THEME_BOOTSTRAP_PLUGIN, themeBootstrapPlugin } from './theme-bootstrap.node'
import { THEME_ATTRIBUTE, THEME_BOOTSTRAP_SOURCE, THEME_STORAGE_KEY } from './theme-keys'

/**
 * 本体（`THEME_BOOTSTRAP_SOURCE`）の中身だけを検査しても、それが `index.html` に
 * 差し込まれていることは分からない。**プラグインを外しても気付けない**状態にしない。
 */
describe('テーマの起動スクリプトを差し込むプラグイン', () => {
  it('最初の描画より前に走る位置へ、本体をそのまま差し込む', () => {
    const transform = themeBootstrapPlugin().transformIndexHtml
    if (typeof transform !== 'function') throw new Error('transformIndexHtml が関数ではない')

    const tags = transform.call(null as never, '', null as never)

    expect(tags).toEqual([
      { tag: 'script', injectTo: 'head-prepend', children: THEME_BOOTSTRAP_SOURCE },
    ])
  })

  it('ビルド設定に載っている', () => {
    const plugins = ((viteConfig.plugins ?? []) as unknown[]).flat(Infinity) as { name?: string }[]

    expect(plugins.map((plugin) => plugin?.name)).toContain(THEME_BOOTSTRAP_PLUGIN)
  })
})

describe('起動スクリプトの実行', () => {
  /** 素のグローバルで走らせ、何が生えるかを見る */
  function runInSandbox(getItem: () => string | null) {
    const attributes = new Map<string, string>()
    const sandbox: Record<string, unknown> = {
      localStorage: { getItem },
      document: {
        documentElement: {
          setAttribute: (name: string, value: string) => void attributes.set(name, value),
        },
      },
    }

    createContext(sandbox)
    runInContext(THEME_BOOTSTRAP_SOURCE, sandbox)
    return { sandbox, theme: () => attributes.get(THEME_ATTRIBUTE) }
  }

  const stored = (value: string | null) => () => value

  it.each(['dark', 'light'])('記憶した選択を属性に載せる: %s', (choice) => {
    expect(runInSandbox(stored(choice)).theme()).toBe(choice)
  })

  it('記憶が無ければ何もしない。属性が無いことが「OS に従う」', () => {
    expect(runInSandbox(stored(null)).theme()).toBeUndefined()
  })

  it.each(['system', 'ダーク'])('選択として扱えない値は載せない: %s', (value) => {
    expect(runInSandbox(stored(value)).theme()).toBeUndefined()
  })

  it('記憶を読めなくても投げない', () => {
    expect(() =>
      runInSandbox(() => {
        throw new Error('SecurityError')
      }),
    ).not.toThrow()
  })

  it('変数をグローバルに漏らさない', () => {
    // 即時関数を外すと `choice` がグローバルに生える
    expect('choice' in runInSandbox(stored('dark')).sandbox).toBe(false)
  })

  it('画面側と同じキー・属性名を使う', () => {
    expect(THEME_BOOTSTRAP_SOURCE).toContain(THEME_STORAGE_KEY)
    expect(THEME_BOOTSTRAP_SOURCE).toContain(THEME_ATTRIBUTE)
  })
})
