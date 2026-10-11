// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref, useTemplateRef, vShow, withDirectives } from 'vue'

import { availableAbove, CANVAS_BOUNDS_ATTRIBUTE, useFitAbove } from './fit-above'
import { useViewState } from './view-state'

beforeEach(() => setActivePinia(createPinia()))

describe('板が上に開ける高さ', () => {
  it('板の下端から、上の限界までの距離', () => {
    expect(availableAbove(600, 10)).toBe(590)
  })

  it('限界より下端が上なら 0（負の高さにしない）', () => {
    expect(availableAbove(5, 10)).toBe(0)
  })
})

/**
 * 板を 1 枚持つ部品。位置は getBoundingClientRect を差し替えて与える。
 *
 * `toggle: 'show'` は v-show で出し入れする板（「表示」の板）。隠れている
 * （display: none）あいだは、ブラウザと同じく位置が 0 になるようにする。
 */
function boardIn(
  canvasTop: number,
  boardBottom: number,
  options: { toggle?: 'always' | 'show' } = {},
) {
  const open = ref(false)
  const Board = defineComponent({
    setup() {
      const board = useTemplateRef<HTMLElement>('board')
      const maxHeight = useFitAbove(board, () => open.value)
      return () => {
        const div = h('div', { ref: 'board', style: { maxHeight: maxHeight.value } })
        return h('main', { [CANVAS_BOUNDS_ATTRIBUTE]: '', style: '--overlay-inset: 10px' }, [
          options.toggle === 'show' ? withDirectives(div, [[vShow, open.value]]) : div,
        ])
      }
    },
  })
  const wrapper = mount(Board, { attachTo: document.body })
  const board = wrapper.get('div').element as HTMLElement
  wrapper.get('main').element.getBoundingClientRect = () => ({ top: canvasTop }) as DOMRect
  board.getBoundingClientRect = () =>
    ({ bottom: board.style.display === 'none' ? 0 : boardBottom }) as DOMRect
  return { wrapper, open, board }
}

describe('板を開いたら、キャンバスの上端（余白を除く）までに収める（UT-32）', () => {
  it('開くと、上に開ける高さを上限にする', async () => {
    const { wrapper, open } = boardIn(100, 600)
    open.value = true
    await flushPromises()

    // 600 − (100 + 余白 10)
    expect(wrapper.get('div').element.style.maxHeight).toBe('490px')
    wrapper.unmount()
  })

  it('キャンバスの大きさが変わったら（一覧の開閉・窓のリサイズ）測り直す', async () => {
    const { wrapper, open } = boardIn(100, 600)
    open.value = true
    await flushPromises()

    // 折り返したツールバーが伸び、板の下端が上がった
    wrapper.get('div').element.getBoundingClientRect = () => ({ bottom: 400 }) as DOMRect
    useViewState().setCanvasSize(500, 700)
    await flushPromises()

    expect(wrapper.get('div').element.style.maxHeight).toBe('290px')
    wrapper.unmount()
  })

  it('閉じているあいだは上限を持たない', () => {
    const { wrapper } = boardIn(100, 600)

    expect(wrapper.get('div').element.style.maxHeight).toBe('')
    wrapper.unmount()
  })
})

describe('v-show で出し入れする板（「表示」の板）', () => {
  it('表示に切り替わってから測る（隠れたまま測ると高さ 0 に潰れる）', async () => {
    const { wrapper, open, board } = boardIn(100, 600, { toggle: 'show' })

    open.value = true
    await flushPromises()

    expect(board.style.maxHeight).toBe('490px')
    wrapper.unmount()
  })
})
