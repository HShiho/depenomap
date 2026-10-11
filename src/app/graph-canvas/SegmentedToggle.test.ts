// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createPinia, setActivePinia } from 'pinia'

import ColumnAxisToggle from './ColumnAxisToggle.vue'
import GranularityToggle from './GranularityToggle.vue'
import SegmentedToggle from './SegmentedToggle.vue'

const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
] as const

function mountToggle(disabled: boolean) {
  return mount(SegmentedToggle, {
    props: { label: '切り替え', options, modelValue: 'a', disabled, note: '理由' },
  })
}

/** ホバーで効く見た目の指定 */
const hoverClasses = (classes: string[]) => classes.filter((name) => name.includes('hover:'))

describe('押せないときの見た目（UT-30 / UT-31）', () => {
  it('押せないときは、ホバーで見た目を変えない', () => {
    /*
     * 押せない口が反応すると押せるように見える。**選択中の背景も消さない** —
     * ホバーで背景を透明にする指定を全ボタンに付けると、選択中の項目まで
     * 背景が抜け、いまどちらが効いているのかが一瞬読めなくなる
     */
    for (const button of mountToggle(true).findAll('button')) {
      for (const name of hoverClasses(button.classes())) {
        expect(name, button.text()).toMatch(/^enabled:/)
      }
    }
  })

  it('押せるときは、選ばれていない項目がホバーに反応する', () => {
    const unselected = mountToggle(false)
      .findAll('button')
      .find((button) => button.attributes('aria-pressed') === 'false')!

    expect(hoverClasses(unselected.classes()).length).toBeGreaterThan(0)
  })
})

describe('押せないときの選択中の項目（UT-30）', () => {
  it('押せないときも、選択中の項目は読める色で出す', () => {
    // 押せない色（線と同じ淡さ）を選択中にも当てると、背景に溶けてどちらが効いているか読めない
    const selected = mountToggle(true)
      .findAll('button')
      .find((button) => button.attributes('aria-pressed') === 'true')!

    expect(selected.classes()).not.toContain('disabled:text-line')
  })

  it('選ばれていない項目は、押せないことが色で分かる', () => {
    const unselected = mountToggle(true)
      .findAll('button')
      .find((button) => button.attributes('aria-pressed') === 'false')!

    expect(unselected.classes()).toContain('disabled:text-line')
  })
})

describe('効かない理由の頭の印', () => {
  it('理由の頭に「※」を付ける。読み上げには含めない', () => {
    // 注記であることを見た目で示す。読み上げでは「米」と読まれるので外す
    const wrapper = mountToggle(true)
    const note = wrapper.get(
      `[id="${wrapper.get('[role="group"]').attributes('aria-describedby')}"]`,
    )

    expect(note.text().startsWith('※')).toBe(true)
    expect(note.get('[aria-hidden="true"]').text()).toBe('※')
  })
})

describe('狭いときに見出しを落とす（UT-32）', () => {
  const labelOf = (wrapper: ReturnType<typeof mount>) =>
    wrapper.get(`[id="${wrapper.get('[role="group"]').attributes('aria-labelledby')}"]`)

  it('指定すると、帯が狭いときに見出しを画面から落とす。読み上げの名前は残す', () => {
    // 見出しの要素は残し、群の名前（aria-labelledby）として読まれ続ける
    const wrapper = mount(SegmentedToggle, {
      props: { label: '粒度', options, modelValue: 'a', compactLabel: true },
    })

    expect(labelOf(wrapper).text()).toBe('粒度')
    expect(labelOf(wrapper).classes()).toContain('@max-toolbar:sr-only')
  })

  it('指定しなければ、狭くても見出しを出す（「表示」の板の中など）', () => {
    const wrapper = mount(SegmentedToggle, {
      props: { label: '経由の行き先', options, modelValue: 'a' },
    })

    expect(labelOf(wrapper).classes()).not.toContain('@max-toolbar:sr-only')
  })
})

describe('ツールバーの切り替えは、狭いときに見出しを落とす（UT-32）', () => {
  /*
   * 指定を外しても、SegmentedToggle 単体の検査は通る。ツールバーに置く 2 つに
   * 指定が付いていることをここで見る。配置そのものは jsdom では測れない
   */
  it.each([
    ['粒度', GranularityToggle],
    ['並べ方', ColumnAxisToggle],
  ])('%s', (label, component) => {
    setActivePinia(createPinia())
    const wrapper = mount(component)
    const name = wrapper.get(
      `[id="${wrapper.get('[role="group"]').attributes('aria-labelledby')}"]`,
    )

    expect(name.text()).toBe(label)
    expect(name.classes()).toContain('@max-toolbar:sr-only')
  })
})
