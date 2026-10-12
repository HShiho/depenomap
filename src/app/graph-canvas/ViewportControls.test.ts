// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { MAX_SCALE, MIN_SCALE } from './viewport'
import ViewportControls from './ViewportControls.vue'

const button = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.get(`button[aria-label="${label}"]`)

describe('ズームのボタン（UT-28 / M-11）', () => {
  it('押すと、拡大・縮小を伝える', async () => {
    const wrapper = mount(ViewportControls, { props: { scale: 1, movedCount: 0 } })

    await button(wrapper, '拡大').trigger('click')
    await button(wrapper, '縮小').trigger('click')

    expect(wrapper.emitted('zoomIn')).toHaveLength(1)
    expect(wrapper.emitted('zoomOut')).toHaveLength(1)
  })

  it('上限では拡大を、下限では縮小を押せない（限界なのか効かないのかを区別できる）', async () => {
    const atMax = mount(ViewportControls, { props: { scale: MAX_SCALE, movedCount: 0 } })
    const atMin = mount(ViewportControls, { props: { scale: MIN_SCALE, movedCount: 0 } })

    expect(button(atMax, '拡大').attributes('aria-disabled')).toBe('true')
    expect(button(atMax, '縮小').attributes('aria-disabled')).toBe('false')
    expect(button(atMin, '縮小').attributes('aria-disabled')).toBe('true')
    expect(button(atMin, '拡大').attributes('aria-disabled')).toBe('false')

    // 押しても伝えない
    await button(atMax, '拡大').trigger('click')
    await button(atMin, '縮小').trigger('click')
    expect(atMax.emitted('zoomIn')).toBeUndefined()
    expect(atMin.emitted('zoomOut')).toBeUndefined()
  })

  it('限界に達しても焦点を持ったまま（disabled にすると焦点が文書の先頭へ落ちる）', () => {
    /*
     * キーボードで押し続けて限界に達したとき、押していたボタンが disabled になると
     * 焦点は body へ落ち、ツールバーでの位置を失う。このボタンはポインタ以外でも
     * 使えるように置いたものなので、焦点を奪わない
     */
    const atMax = mount(ViewportControls, { props: { scale: MAX_SCALE, movedCount: 0 } })

    expect(button(atMax, '拡大').attributes('disabled')).toBeUndefined()
  })
})
