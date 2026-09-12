// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { FileNode, MethodNode } from '@/core/graph/schema'
import FileRow from './FileRow.vue'
import MethodRow from './MethodRow.vue'

const file: FileNode = {
  id: 'file:src/usecase/CreateTodo.ts',
  kind: 'file',
  name: 'CreateTodo.ts',
  path: 'src/usecase/CreateTodo.ts',
  layer: 'usecase',
}

const method: MethodNode = {
  id: 'method:src/usecase/CreateTodo.ts#CreateTodo.execute',
  kind: 'method',
  parent: file.id,
  name: 'execute',
  owner: 'CreateTodo',
  ownerKind: 'class',
  loc: { line: 12, column: 3 },
}

function mountFile(overrides: Partial<InstanceType<typeof FileRow>['$props']> = {}) {
  return mount(FileRow, {
    props: {
      node: file,
      fanIn: 4,
      open: false,
      selected: false,
      colour: 'var(--color-layer-2)',
      ...overrides,
    },
  })
}

describe('ファイル行', () => {
  it('ファイル名と置き場所を出す', () => {
    const wrapper = mountFile()

    expect(wrapper.text()).toContain('CreateTodo.ts')
    expect(wrapper.text()).toContain('src/usecase')
  })

  it('ルート直下のファイルは、名前を 2 回並べない', () => {
    // スキーマはパスに区切りを要求していない。フィクスチャは全部 src/ 配下で踏まない
    const root = { ...file, name: 'vite.config.ts', path: 'vite.config.ts' }
    const wrapper = mountFile({ node: root })

    expect(wrapper.text().match(/vite\.config\.ts/g)).toHaveLength(1)
  })

  it('被依存数を出す。数え直さず受け取った値のまま（US-10）', () => {
    expect(mountFile({ fanIn: 7 }).text()).toContain('7')
  })

  it('層の色帯を出す', () => {
    const swatch = mountFile().find('[style]')

    expect(swatch.attributes('style')).toContain('var(--color-layer-2)')
  })

  it('開閉と選択は別の操作にする', async () => {
    // 1 つのボタンに載せると、選ぼうとするたびに開き、開くたびに選択が動く
    const wrapper = mountFile()
    const [caret, row] = wrapper.findAll('button')

    await caret!.trigger('click')
    await row!.trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('開いているかどうかを、読み上げにも出す', () => {
    expect(mountFile({ open: false }).find('button').attributes('aria-expanded')).toBe('false')
    expect(mountFile({ open: true }).find('button').attributes('aria-expanded')).toBe('true')
  })

  it('選択中はそれと分かる', () => {
    const selected = mountFile({ selected: true }).findAll('button')[1]!

    expect(selected.attributes('aria-current')).toBe('true')
    expect(selected.classes()).toContain('bg-accent-soft')
  })

  it('印を差し込める（UT-10 の循環、UT-11 の一致）', () => {
    const wrapper = mount(FileRow, {
      props: { node: file, fanIn: 1, open: false, selected: false, colour: '#000' },
      slots: { badges: '<span data-test="badge">循環</span>' },
    })

    expect(wrapper.find('[data-test="badge"]').exists()).toBe(true)
  })
})

describe('メソッド行', () => {
  it('owner.name を出す', () => {
    const wrapper = mount(MethodRow, { props: { node: method, fanIn: 2, selected: false } })

    expect(wrapper.text()).toContain('CreateTodo.')
    expect(wrapper.text()).toContain('execute')
  })

  it('トップレベル関数は名前だけ', () => {
    const wrapper = mount(MethodRow, {
      props: { node: { ...method, owner: null, ownerKind: null }, fanIn: 0, selected: false },
    })

    expect(wrapper.text()).not.toContain('.')
    expect(wrapper.text()).toContain('execute')
  })

  it('所属は行の位置で示す。パスは出さない', () => {
    const wrapper = mount(MethodRow, { props: { node: method, fanIn: 2, selected: false } })

    expect(wrapper.text()).not.toContain('src/usecase')
  })

  it('押すと選択を知らせる', async () => {
    const wrapper = mount(MethodRow, { props: { node: method, fanIn: 2, selected: false } })
    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('印を差し込める', () => {
    const wrapper = mount(MethodRow, {
      props: { node: method, fanIn: 2, selected: false },
      slots: { badges: '<span data-test="badge">循環</span>' },
    })

    expect(wrapper.find('[data-test="badge"]').exists()).toBe(true)
  })
})
