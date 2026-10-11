// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

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
