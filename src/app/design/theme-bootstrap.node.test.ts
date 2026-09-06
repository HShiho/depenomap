import { describe, expect, it } from 'vitest'

import viteConfig from '../../../vite.config'
import { themeBootstrapPlugin } from './theme-bootstrap.node'
import { THEME_BOOTSTRAP_SOURCE } from './theme-keys'

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

    expect(plugins.map((plugin) => plugin?.name)).toContain('depenomap:theme-bootstrap')
  })
})
