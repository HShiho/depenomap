// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'
import SidebarPanel from './SidebarPanel.vue'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

beforeEach(() => setActivePinia(createPinia()))

function setup() {
  const state = useViewState()
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  return { state, wrapper: mount(SidebarPanel) }
}

/** 一覧に出ているファイル行を、上から順に */
const shownFiles = (wrapper: ReturnType<typeof setup>['wrapper']) =>
  wrapper
    .findAll('[data-node-id]')
    .map((row) => row.attributes('data-node-id')!)
    .filter((id) => id.startsWith('file:'))

describe('並べ替え（US-10）', () => {
  it('選択肢はパス順と被依存数の降順', () => {
    const { wrapper } = setup()

    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      'パス順',
      '被依存数（降順）',
    ])
  })

  it('既定はパス順', () => {
    const { wrapper } = setup()
    const paths = shownFiles(wrapper).map((id) => viewModel.nodeById.get(id)!)

    expect(wrapper.find('select').element.value).toBe('path')
    expect(paths.map((node) => (node.kind === 'file' ? node.path : ''))).toEqual(
      viewModel.nodes.file.map((file) => file.path).sort((a, b) => a.localeCompare(b)),
    )
  })

  it('被依存数を選ぶと、多い順に並び替わる', async () => {
    const { wrapper } = setup()
    await wrapper.find('select').setValue('fan-in')

    const counts = shownFiles(wrapper).map((id) => viewModel.fanInOf(id, 'file'))
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(counts[0]).toBeGreaterThan(counts.at(-1)!)
  })

  it('並べ替えても、開いているファイルは開いたまま', async () => {
    const { wrapper } = setup()
    const target = viewModel.nodes.file.find(
      (file) => (viewModel.methodsOfFile.get(file.id) ?? []).length > 0,
    )!
    const caretOf = (id: string) =>
      wrapper
        .find(`[data-node-id="${id}"]`)
        .element.parentElement!.querySelector('[aria-expanded]')!

    caretOf(target.id).dispatchEvent(new Event('click'))
    await wrapper.vm.$nextTick()
    await wrapper.find('select').setValue('fan-in')

    expect(caretOf(target.id).getAttribute('aria-expanded')).toBe('true')
  })

  it('ファイル数を出す', () => {
    const { wrapper } = setup()

    expect(wrapper.text()).toContain(`${viewModel.nodes.file.length} ファイル`)
  })

  it('並べ替えに名前を与える', () => {
    const { wrapper } = setup()
    const id = wrapper.find('select').attributes('id')

    expect(wrapper.find(`label[for="${id}"]`).text()).toBe('並べ替え')
  })
})
