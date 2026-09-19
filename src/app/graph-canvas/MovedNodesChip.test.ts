// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { FileNode, GraphNode } from '@/core/graph/schema'
import MovedNodesChip from './MovedNodesChip.vue'

function file(name: string, directory = 'src'): FileNode {
  return {
    id: `file:${directory}/${name}`,
    kind: 'file',
    name,
    path: `${directory}/${name}`,
  }
}

const setup = (nodes: readonly GraphNode[], outOfView = 0) =>
  mount(MovedNodesChip, { props: { nodes, outOfView } })

describe('手で動かしたノードの印（US-18 / UT-17）', () => {
  it('1 件も無ければ、何も出さない', () => {
    expect(setup([]).text()).toBe('')
  })

  it('件数を出す', () => {
    expect(setup([file('a.ts'), file('b.ts')]).text()).toContain('2')
  })

  it('触れるまで名前は出さない', () => {
    // 図に重なるので、既定では小さく出す
    const wrapper = setup([file('a.ts')])

    expect(wrapper.text()).not.toContain('a.ts')
  })

  it('触れると名前が出る', async () => {
    const wrapper = setup([file('a.ts')])

    await wrapper.trigger('focusin')

    expect(wrapper.text()).toContain('a.ts')
  })

  it('離すと名前が引っ込む', async () => {
    const wrapper = setup([file('a.ts')])
    await wrapper.trigger('mouseenter')

    await wrapper.trigger('mouseleave')

    expect(wrapper.text()).not.toContain('a.ts')
  })

  it('多いときは上限まで出し、残りは数で示す', async () => {
    // 図に重なるので、全部並べると図が読めなくなる
    const nodes = Array.from({ length: 11 }, (_, index) => file(`f${index}.ts`))
    const wrapper = setup(nodes)

    await wrapper.trigger('focusin')

    expect(wrapper.findAll('li')).toHaveLength(8 + 1)
    expect(wrapper.text()).toContain('ほか 3 件')
  })

  it('上限ちょうどなら、残りは出さない', async () => {
    const nodes = Array.from({ length: 8 }, (_, index) => file(`f${index}.ts`))
    const wrapper = setup(nodes)

    await wrapper.trigger('focusin')

    expect(wrapper.findAll('li')).toHaveLength(8)
    expect(wrapper.text()).not.toContain('ほか')
  })

  it('別のディレクトリの同名ファイルも、2 件として並ぶ', async () => {
    /*
     * 名前は一意ではない。一意なのはノード ID だけ。
     *
     * 並びのキーにノード ID を使っていることは、ここでは確かめられない
     * （Vue 3.5 は重複したキーを記録しない）。**見ているのは、同名でも
     * 2 件として出ること**まで。
     */
    const wrapper = setup([file('index.ts', 'src/a'), file('index.ts', 'src/b')])

    await wrapper.trigger('focusin')

    expect(wrapper.text()).toContain('2')
    expect(wrapper.findAll('li')).toHaveLength(2)
  })

  it('図に出ていないぶんは、そのことを添える', async () => {
    // 隠れているあいだも上書きは残っている。ただし探しに行けない
    const wrapper = setup([file('a.ts'), file('b.ts')], 1)

    await wrapper.trigger('focusin')

    expect(wrapper.text()).toContain('1 件はいま図に出ていません')
  })

  it('全部出ているときは、その断りを出さない', async () => {
    const wrapper = setup([file('a.ts')], 0)

    await wrapper.trigger('focusin')

    expect(wrapper.text()).not.toContain('図に出ていません')
  })
})
