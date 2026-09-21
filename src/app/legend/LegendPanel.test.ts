// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { edgeLegendOf, NODE_LEGEND } from './legend-items'
import LegendPanel from './LegendPanel.vue'

enableAutoUnmount(afterEach)

const layers = [
  { key: 'domain', name: 'ドメイン', colour: 'var(--color-layer-3)' },
  { key: 'infra', name: 'インフラ', colour: 'var(--color-layer-4)' },
]

function show(props: { layers?: typeof layers; reading?: 'interface' | 'implementation' } = {}) {
  return mount(LegendPanel, {
    props: { layers: props.layers ?? layers, reading: props.reading ?? 'interface' },
  })
}

const toggle = (wrapper: ReturnType<typeof show>) => wrapper.get('button')

describe('凡例（UT-26 / QR-1）', () => {
  it('既定では畳んでいる', () => {
    // 毎日使う人から図の面積を奪わない（UT-26 の決定）
    const wrapper = show()

    expect(wrapper.find('[aria-label="凡例"]').exists()).toBe(false)
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('畳んでいても、開く口は出ている', () => {
    // 初見の人がここから開く
    expect(toggle(show()).text()).toContain('凡例')
  })

  it('押すと開き、もう一度押すと畳む', async () => {
    const wrapper = show()

    await toggle(wrapper).trigger('click')
    expect(wrapper.find('[aria-label="凡例"]').exists()).toBe(true)
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true')

    await toggle(wrapper).trigger('click')
    expect(wrapper.find('[aria-label="凡例"]').exists()).toBe(false)
  })

  it('図に出ている描き分けを、すべて出す', async () => {
    /*
     * 定義（`legend-items.ts`）に足したものが画面に出ないと、図にはあるのに
     * 凡例に無い、という食い違いができる。**定義を回して確かめる**
     */
    const wrapper = show()
    await toggle(wrapper).trigger('click')

    for (const item of edgeLegendOf('interface')) expect(wrapper.text()).toContain(item.label)
    for (const item of NODE_LEGEND) expect(wrapper.text()).toContain(item.meaning)
  })

  it('線の見本は、図と同じ種別の class で描く', async () => {
    // 見た目の対応が class で結ばれていないと、凡例だけ別の線になる
    const wrapper = show()
    await toggle(wrapper).trigger('click')

    for (const item of edgeLegendOf('interface')) {
      expect(
        wrapper.find(`path.sample.${item.kind}, path.sample[class~="${item.kind}"]`).exists(),
      ).toBe(true)
    }
  })

  it('読み方が変わると、経由の行き先の説明も変わる', async () => {
    // 固定の文言にすると、実装宛で読んでいるあいだ凡例が図と逆のことを言う
    const wrapper = show({ reading: 'implementation' })
    await toggle(wrapper).trigger('click')

    expect(wrapper.text()).toContain('行き先は実装')
    expect(wrapper.text()).not.toContain('行き先はインターフェース')
  })

  it('interface 経由の見本にだけ、中点の印を出す', async () => {
    const wrapper = show()
    await toggle(wrapper).trigger('click')

    expect(wrapper.findAll('circle.sample-dot')).toHaveLength(1)
  })

  it('渡された層を、その名前と色で出す', async () => {
    const wrapper = show()
    await toggle(wrapper).trigger('click')

    expect(wrapper.text()).toContain('ドメイン')
    expect(wrapper.text()).toContain('インフラ')
    expect(wrapper.html()).toContain('var(--color-layer-3)')
  })

  it('層が 1 つも無ければ、層の欄を出さない', async () => {
    // 空の見出しだけが残ると、何かを見落としているように読める
    const wrapper = show({ layers: [] })
    await toggle(wrapper).trigger('click')

    expect(wrapper.text()).not.toContain('層')
  })

  it('数値の読み方と、その数え方を出す', async () => {
    // 線の本数を数えても一致しない（同じ相手との依存は何本でも 1 / UT-02）
    const wrapper = show()
    await toggle(wrapper).trigger('click')

    expect(wrapper.text()).toContain('被依存数')
    expect(wrapper.text()).toContain('1 と数える')
  })

  it('良し悪しを書かない（N-1）', async () => {
    const wrapper = show()
    await toggle(wrapper).trigger('click')

    for (const word of ['違反', 'エラー', '警告', '問題', '望ましい', '多い', '少ない']) {
      expect(wrapper.text()).not.toContain(word)
    }
  })
})
