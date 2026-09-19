// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

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

const setup = (nodes: readonly GraphNode[], outOfView: readonly string[] = []) =>
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

  it('別のディレクトリの同名ファイルも、別のものとして扱う', async () => {
    /*
     * 名前は一意ではない。一意なのはノード ID だけ。
     *
     * 名前を並びのキーにすると、描き直しのときに別のものが同じものと
     * 見なされる。Vue が知らせるのは**更新のとき**で、しかも前後の早道で
     * 消化されずに中ほどを取り替える形になったときだけなので、その形で確かめる。
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const wrapper = setup([file('a.ts'), file('b.ts'), file('c.ts')])
      await wrapper.trigger('focusin')

      await wrapper.setProps({
        nodes: [file('a.ts'), file('index.ts', 'src/x'), file('index.ts', 'src/y'), file('c.ts')],
      })

      expect(wrapper.findAll('li')).toHaveLength(4)
      expect(warn.mock.calls.flat().join(' ')).not.toContain('Duplicate keys')
    } finally {
      warn.mockRestore()
    }
  })

  it('上限からあふれた先に隠れていても、そのことが読める', async () => {
    // 行ごとの印だけだと、隠れたものが上限の外に落ちたときに画面から消える
    const shown = Array.from({ length: 9 }, (_, index) => file(`s${index}.ts`))
    const gone = [file('x.ts'), file('y.ts')]
    const wrapper = setup(
      [...shown, ...gone],
      gone.map((node) => node.id),
    )

    await wrapper.trigger('focusin')

    const rest = wrapper.findAll('li').at(-1)!.text()
    expect(rest).toContain('ほか 3 件')
    expect(rest).toContain('2 件は図に出ていません')
  })

  it('あふれた先に隠れていなければ、その断りは出さない', async () => {
    const nodes = Array.from({ length: 11 }, (_, index) => file(`s${index}.ts`))
    const wrapper = setup(nodes, [nodes[0]!.id])

    await wrapper.trigger('focusin')

    expect(wrapper.findAll('li').at(-1)!.text()).not.toContain('件は図に出ていません')
  })

  it('図に出ていないものは、その行で分かる', async () => {
    // 総数だけだと、並んだ名前のどれを指しているのかが読めない
    const shown = file('a.ts')
    const gone = file('b.ts')
    const wrapper = setup([shown, gone], [gone.id])

    await wrapper.trigger('focusin')

    const rows = wrapper.findAll('li').map((row) => row.text())
    expect(rows.find((row) => row.includes('b.ts'))).toContain('図に出ていません')
    expect(rows.find((row) => row.includes('a.ts'))).not.toContain('図に出ていません')
  })

  it('全部出ているときは、その断りを出さない', async () => {
    const wrapper = setup([file('a.ts')], [])

    await wrapper.trigger('focusin')

    expect(wrapper.text()).not.toContain('図に出ていません')
  })
})
