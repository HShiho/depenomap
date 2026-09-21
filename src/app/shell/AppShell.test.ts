// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppShell from './AppShell.vue'
import { useViewState } from './view-state'

/**
 * 骨格そのものの検査。
 *
 * `canvas-size.ts` 単体のテストは、AppShell が実際にそれを配線していることを
 * 何も保証しない。差し込み口・開閉・観測の接続と解除は、組み立てた状態で見る。
 */

/** jsdom は `ResizeObserver` を持たない。観測を人の手で起こせる形で差し込む */
function stubResizeObserver() {
  let notify: ((entries: { contentRect: { width: number; height: number } }[]) => void) | undefined
  const disconnect = vi.fn()
  const observe = vi.fn()

  class FakeResizeObserver {
    constructor(callback: typeof notify) {
      notify = callback
    }
    observe = observe
    disconnect = disconnect
    unobserve = vi.fn()
  }

  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return {
    observe,
    disconnect,
    resize: (width: number, height: number) => notify?.([{ contentRect: { width, height } }]),
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.unstubAllGlobals()
})

describe('差し込み口', () => {
  it('各領域へ中身を差し込める', () => {
    const wrapper = mount(AppShell, {
      slots: {
        rail: '<button>レール</button>',
        sidebar: '<div>一覧</div>',
        canvas: '<svg data-test="map"></svg>',
        'canvas-overlay': '<span>重ね</span>',
        notice: '<p>通知</p>',
        toolbar: '<div>ツールバー</div>',
      },
    })

    expect(wrapper.find('nav').text()).toBe('レール')
    expect(wrapper.find('aside').text()).toBe('一覧')
    expect(wrapper.find('[data-test="map"]').exists()).toBe(true)
    expect(wrapper.find('.shell-overlay').text()).toBe('重ね')
    expect(wrapper.find('.shell-notice').text()).toBe('通知')
    expect(wrapper.find('.shell-toolbar').text()).toBe('ツールバー')
  })

  it('主要領域はランドマークで、画面の見出しを持つ', () => {
    const wrapper = mount(AppShell)

    expect(wrapper.find('main').attributes('aria-label')).toBe('ノードマップ')
    expect(wrapper.find('h1').text()).toBe('depenomap')
  })
})

describe('一覧の開閉', () => {
  it('状態に応じて列の畳み方が変わる（US-08 の受け皿）', async () => {
    const state = useViewState()
    const wrapper = mount(AppShell)

    expect(wrapper.find('.shell').attributes('data-panel')).toBe('open')

    state.sidebarOpen = false
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.shell').attributes('data-panel')).toBe('closed')
    // 畳んでいるあいだ、パネルの中身は操作の対象から外す
    expect(wrapper.find('aside').attributes('inert')).toBeDefined()
  })
})

describe('キャンバスの実寸', () => {
  it('観測して状態へ流す', () => {
    const observer = stubResizeObserver()
    const state = useViewState()

    mount(AppShell, { attachTo: document.body })
    observer.resize(1280, 720)

    expect(observer.observe).toHaveBeenCalledOnce()
    expect([state.canvasWidth, state.canvasHeight]).toEqual([1280, 720])
  })

  it('画面から外れたら観測をやめる', () => {
    const observer = stubResizeObserver()

    const wrapper = mount(AppShell, { attachTo: document.body })
    wrapper.unmount()

    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('観測手段が無い環境でも組み立てられる', () => {
    expect(() => mount(AppShell)).not.toThrow()
  })
})

describe('`inert` の出し方（UT-13 で判明）', () => {
  /**
   * `inert` を実装していない jsdom では、`false` を渡すと `inert="false"` と
   * いう属性が出る（Vue は `key in el` で属性かプロパティかを決めるため）。
   * HTML の `inert` は値に関わらず属性があれば効くので、その形のままだと
   * 「触れるかどうか」を属性で見られない。`undefined` に落として属性ごと消す。
   *
   * jsdom は `inert` を実装していないため、押せるかどうかでは確かめられない。
   * **属性の有無で見る**。
   */
  it('触れる領域には属性を出さない', () => {
    const state = useViewState()
    state.sidebarOpen = true
    const wrapper = mount(AppShell)

    for (const selector of ['nav', 'aside', 'main']) {
      expect(wrapper.find(selector).attributes()).not.toHaveProperty('inert')
    }
  })

  it('畳んだ一覧には属性を出す', () => {
    const state = useViewState()
    state.sidebarOpen = false
    const wrapper = mount(AppShell)

    expect(wrapper.find('aside').attributes()).toHaveProperty('inert')
  })
})

describe('下端の帯（UT-26）', () => {
  /**
   * 凡例とツールバーは**同じ器の中で並ぶ**。それぞれを絶対位置で置くと、幅が
   * 狭いときに重なり、あとに置いたほうがポインタを奪う。
   *
   * jsdom は寸法を持たないので、重ならないこと自体は見られない。**並べる形に
   * なっていること**（同じ親・列の定義）を見る。
   */
  it('凡例とツールバーは、同じ器に並べて置く', () => {
    const wrapper = mount(AppShell, {
      slots: { 'canvas-legend': '<p>凡例</p>', toolbar: '<p>道具</p>' },
    })

    const bottom = wrapper.get('.shell-bottom')
    expect(bottom.find('.shell-legend').exists()).toBe(true)
    expect(bottom.find('.shell-toolbar').exists()).toBe(true)
  })

  it('凡例を差し込まなくても、ツールバーの位置が変わらない', () => {
    // 釣り合いの列が無いと、凡例が空のときにツールバーが左へ寄る
    const wrapper = mount(AppShell, { slots: { toolbar: '<p>道具</p>' } })

    expect(wrapper.get('.shell-bottom').element.children).toHaveLength(3)
  })
})
