// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel, type Granularity } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'
import * as columnAxis from './column-axis'
import { buildLayout, NODE_HEIGHT, NODE_WIDTH } from './layout'
import GraphCanvas from './GraphCanvas.vue'

import fixture from '../../../test-data/dependency-graph.complex.json'

/**
 * 描画そのものの検査。配置・経路・変換は純粋関数側で見ているので、ここは
 * **それらが実際に組み立てられ、操作が器へ返ること**を押さえる。
 */

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

/** 検査で使うキャンバスの実寸。画面に収まるかの判定でも同じ値を使う */
const CANVAS = { width: 1200, height: 800 }

function setup(options: { withGraph?: boolean; granularity?: Granularity } = {}) {
  const state = useViewState()
  if (options.withGraph !== false) {
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  }
  state.setCanvasSize(CANVAS.width, CANVAS.height)
  if (options.granularity) state.setGranularity(options.granularity)
  return { state, wrapper: mount(GraphCanvas) }
}

beforeEach(() => setActivePinia(createPinia()))

describe('描くもの', () => {
  it('ファイルをノード、依存を矢印として描く', () => {
    const { wrapper } = setup()

    expect(wrapper.findAll('g.node')).toHaveLength(viewModel.nodes.file.length)
    expect(wrapper.findAll('path.edge').length).toBeGreaterThan(0)
    // 矢尻は「使う側 → 使われる側」の向きを示す
    expect(wrapper.find('path.edge').attributes('marker-end')).toBe('url(#arrow)')
  })

  it('層を列にして、名前は正本 JSON の定義から取る（ADR-002）', () => {
    const { wrapper } = setup()

    const heads = wrapper.findAll('text.head').map((head) => head.text())
    expect(heads).toEqual(result.graph.layers.map((layer) => layer.name))
  })

  it('ノードには識別子・パス・被依存/依存数を出す', () => {
    const { wrapper } = setup()
    const node = wrapper.find('g.node')

    expect(node.find('text.name').text().length).toBeGreaterThan(0)
    expect(node.find('text.path').text().length).toBeGreaterThan(0)
    expect(node.find('text.stat').text()).toMatch(/↙\d+ ↗\d+/)
  })

  it('グラフが無ければ何も描かない。落ちもしない', () => {
    const { wrapper } = setup({ withGraph: false })

    expect(wrapper.findAll('g.node')).toHaveLength(0)
    expect(wrapper.findAll('path.edge')).toHaveLength(0)
  })
})

describe('層が未設定のノード', () => {
  it('破綻せずに置かれる', () => {
    const state = useViewState()
    const raw = structuredClone(fixture) as { nodes: { layer?: string }[] }
    delete raw.nodes[0]!.layer

    const loaded = loadGraphFromValue(raw)
    if (!loaded.ok) throw new Error('層を外したフィクスチャが読めない')
    state.applyLoadOutcome({ kind: 'ready', viewModel: buildViewModel(loaded.graph), warnings: [] })
    state.setCanvasSize(1200, 800)

    const wrapper = mount(GraphCanvas)

    expect(wrapper.findAll('g.node')).toHaveLength(
      loaded.graph.nodes.filter((n) => n.kind === 'file').length,
    )
    expect(wrapper.findAll('text.head').map((head) => head.text())).toContain('層なし')
  })
})

describe('操作の口', () => {
  it('ノードのクリックで選択が移り、絞り込みも立つ（US-12）', async () => {
    const { state, wrapper } = setup()
    const node = wrapper.find('g.node')
    const id = node.attributes('data-node-id')!

    await node.trigger('click')

    // 絞り込みで並びが変わるので、押した行は ID で掴む
    expect(state.selectedNodeId).toBe(id)
    expect(state.narrowedToSelection).toBe(true)
    expect(wrapper.find(`[data-node-id="${id}"]`).classes()).toContain('selected')
  })

  it('背景のクリックでは、選択も絞り込みも解けない（UT-14 の決定）', async () => {
    /*
     * 絞り込み中は背景の面積が大きく、図を眺めるつもりの空クリックで解けてしまう。
     * 解く口は印の ✕・Esc・同じノードの再クリックの 3 つに絞る
     */
    const { state, wrapper } = setup()
    await wrapper.find('g.node').trigger('click')
    const selected = state.selectedNodeId

    await wrapper.find('svg').trigger('click')

    expect(state.selectedNodeId).toBe(selected)
    expect(state.narrowedToSelection).toBe(true)
  })

  it('右クリックは口を開けておく。中身は後続 UT が載せる', async () => {
    const { wrapper } = setup()

    await wrapper.find('g.node').trigger('contextmenu')

    const emitted = wrapper.emitted('nodeContextMenu')
    expect(emitted).toHaveLength(1)
    expect((emitted![0]![0] as { kind: string }).kind).toBe('file')
  })
})

describe('ビューポートの口', () => {
  it('全体表示は図を画面へ収める', () => {
    const { wrapper } = setup()
    const canvas = wrapper.vm as unknown as {
      viewport: { x: number; y: number; scale: number }
    }

    // 「倍率が 1 以下」だけだと、一度も合わせていない状態（等倍）でも通る。
    // 図が実際に画面へ収まっていることを見る
    const layout = buildLayout({
      nodes: viewModel.nodes.file,
      edges: viewModel.edges.file,
      columnOf: (node) => viewModel.layerKeys.indexOf(viewModel.layerOf(node.id).key),
    })
    expect(layout.width * canvas.viewport.scale).toBeLessThanOrEqual(CANVAS.width)
    expect(layout.height * canvas.viewport.scale).toBeLessThanOrEqual(CANVAS.height)
    expect(canvas.viewport.scale).toBeLessThan(1)
  })

  it('ノードへ寄せられる', () => {
    const { wrapper } = setup()
    const canvas = wrapper.vm as unknown as {
      viewport: { x: number; y: number }
      focusNode: (id: string) => void
    }
    const before = { ...canvas.viewport }

    canvas.focusNode(viewModel.nodes.file[10]!.id)

    expect(canvas.viewport).not.toEqual(before)
  })
})

describe('全体表示のタイミング', () => {
  it('マウントのあとにグラフと実寸が届いても全体表示になる', async () => {
    const state = useViewState()
    const wrapper = mount(GraphCanvas)

    // 実アプリの順序: 骨格が立ってから、読み込みと実寸の観測が届く
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
    await wrapper.vm.$nextTick()
    state.setCanvasSize(1200, 800)
    await wrapper.vm.$nextTick()

    const canvas = wrapper.vm as unknown as { viewport: { scale: number } }
    expect(canvas.viewport.scale).toBeLessThan(1)
  })

  it('実寸が来ていないうちは合わせようとしない', () => {
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })

    const wrapper = mount(GraphCanvas)

    const canvas = wrapper.vm as unknown as { viewport: { scale: number } }
    expect(canvas.viewport.scale).toBe(1)
  })
})

describe('ノードに出す数', () => {
  it('同じ相手への依存が 2 本あっても 1 と数える（被依存と単位を揃える）', () => {
    const raw = structuredClone(fixture) as {
      edges: { id: string; from: string; to: string; kind: string; granularity: string }[]
    }
    const sample = raw.edges.find((edge) => edge.kind === 'import')!
    // 型の import と値の import は別エッジになる。同じ 2 ノード間に 2 本引く
    raw.edges.push({ ...sample, id: `${sample.id}#type`, importKind: 'type' } as never)

    const loaded = loadGraphFromValue(raw)
    if (!loaded.ok) throw new Error('エッジを足したフィクスチャが読めない')
    const state = useViewState()
    state.applyLoadOutcome({ kind: 'ready', viewModel: buildViewModel(loaded.graph), warnings: [] })
    state.setCanvasSize(1200, 800)

    const wrapper = mount(GraphCanvas)
    const before = mountWithFixture()

    const statOf = (w: ReturnType<typeof mount>, id: string) =>
      w
        .findAll('g.node')
        .find((node) => node.text().includes(shortNameOf(id)))
        ?.find('text.stat')
        .text()

    // 探索が外れて undefined どうしを比べても通る形にしない
    expect(statOf(wrapper, sample.from)).toMatch(/↙\d+ ↗\d+/)
    expect(statOf(wrapper, sample.from)).toBe(statOf(before, sample.from))
  })
})

/** 素のフィクスチャで描いたもの。数え方の比較に使う */
function mountWithFixture() {
  setActivePinia(createPinia())
  const state = useViewState()
  state.applyLoadOutcome({ kind: 'ready', viewModel, warnings: [] })
  state.setCanvasSize(1200, 800)
  return mount(GraphCanvas)
}

function shortNameOf(nodeId: string): string {
  return nodeId.split('/').at(-1) ?? nodeId
}

describe('全体表示のあとの移動', () => {
  it('リサイズで巻き戻らない', async () => {
    const { state, wrapper } = setup()
    const canvas = wrapper.vm as unknown as {
      viewport: { x: number; y: number }
      focusNode: (id: string) => void
    }

    canvas.focusNode(viewModel.nodes.file[10]!.id)
    const moved = { ...canvas.viewport }
    // 一覧の開閉には 0.18 秒のアニメーションがあり、実寸が連続して変わる
    state.setCanvasSize(1500, 800)
    await wrapper.vm.$nextTick()

    expect(canvas.viewport.x).toBeCloseTo(moved.x)
    expect(canvas.viewport.y).toBeCloseTo(moved.y)
  })

  it('図が入れ替わったら、また全体表示に戻す', async () => {
    const { state, wrapper } = setup()
    const canvas = wrapper.vm as unknown as {
      viewport: { x: number }
      focusNode: (id: string) => void
    }
    canvas.focusNode(viewModel.nodes.file[10]!.id)
    const moved = canvas.viewport.x

    // 読み込み直すと、同じ内容でも別のグラフとして届く
    state.applyLoadOutcome({
      kind: 'ready',
      viewModel: buildViewModel(result.graph),
      warnings: [],
    })
    await wrapper.vm.$nextTick()

    expect(canvas.viewport.x).not.toBeCloseTo(moved)
  })
})

describe('メソッド粒度', () => {
  it('メソッドがノード、呼び出しが矢印として出る', () => {
    const { wrapper } = setup({ granularity: 'method' })

    expect(wrapper.findAll('g.node')).toHaveLength(viewModel.nodes.method.length)
    expect(wrapper.findAll('path.edge').length).toBeGreaterThan(0)
  })

  it('見出しは owner.name。トップレベル関数は名前だけ', () => {
    const { wrapper } = setup({ granularity: 'method' })
    const titles = wrapper.findAll('text.name').map((text) => text.text())

    expect(titles).toContain('TodoController.post')
    // owner を持たないメソッド（トップレベル関数）も落とさない
    expect(titles).toContain('requireUser')
  })

  it('どのファイルに属しているかがノードから分かる（US-02）', () => {
    const { wrapper } = setup({ granularity: 'method' })
    const node = wrapper
      .findAll('g.node')
      .find((candidate) => candidate.find('text.name').text() === 'TodoController.post')!

    // 2 行目は所属ファイルのパス（切り詰められていても末尾が残る）
    expect(node.find('text.path').text()).toContain('TodoController.ts')
  })

  it('すべてのメソッドが所属ファイルを示す', () => {
    const { wrapper } = setup({ granularity: 'method' })
    const paths = wrapper.findAll('g.node').map((node) => node.find('text.path').text())

    // 並び順は交差削減が決めるので隣接は見ない。1 つも空にならないことを見る
    expect(paths).toHaveLength(viewModel.nodes.method.length)
    expect(paths.every((path) => path.length > 0)).toBe(true)
  })

  it('粒度を切り替えるとノードが入れ替わる（US-03）', async () => {
    const { state, wrapper } = setup()
    expect(wrapper.findAll('g.node')).toHaveLength(viewModel.nodes.file.length)

    state.setGranularity('method')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('g.node')).toHaveLength(viewModel.nodes.method.length)
  })

  it('切り替えてもクリックで選択できる', async () => {
    const { state, wrapper } = setup({ granularity: 'method' })

    await wrapper.find('g.node').trigger('click')

    expect(state.selectedNodeId).toMatch(/^method:/)
  })
})

describe('呼び出しの形の描き分け', () => {
  it('クラスとインターフェースの対応を、他と違う線で描く', () => {
    const { wrapper } = setup({ granularity: 'method' })
    const implementsEdges = viewModel.edges.method.filter((edge) => edge.kind === 'implements')

    expect(implementsEdges.length).toBeGreaterThan(0)
    expect(wrapper.findAll('path.edge.implements')).toHaveLength(implementsEdges.length)
  })

  it('経由の呼び出しは、線と印の両方で示す', () => {
    const { wrapper } = setup({ granularity: 'method' })
    const viaEdges = viewModel.edges.method.filter(
      (edge) => 'resolution' in edge && edge.resolution === 'via-interface',
    )

    expect(viaEdges.length).toBeGreaterThan(0)
    expect(wrapper.findAll('path.edge.via')).toHaveLength(viaEdges.length)
    expect(wrapper.findAll('circle.via-dot')).toHaveLength(viaEdges.length)
  })

  it('経由の呼び出しは、型検査器の答え（インターフェース宛）に向かう', () => {
    const { wrapper } = setup({ granularity: 'method' })
    const via = viewModel.edges.method.find(
      (edge) => 'resolution' in edge && edge.resolution === 'via-interface',
    )!

    const path = wrapper
      .findAll('path.edge')
      .find((candidate) => candidate.attributes('data-edge-id') === via.id)!
    const interfaceNode = wrapper
      .findAll('g.node')
      .find((node) => node.attributes('data-node-id') === via.to)!

    // 線の終点が、インターフェース側のノードの辺に着いている。
    // 実装ノードへ向けてしまうと、型検査器の答えが図から消える。
    // 同じ行には別の列のノードも並ぶため、Y だけでは足りない
    const transform = /translate\(([\d.-]+),([\d.-]+)\)/.exec(
      interfaceNode.attributes('transform') ?? '',
    )!
    const points = [...(path.attributes('d') ?? '').matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
    const end = { x: Number(points.at(-1)![1]), y: Number(points.at(-1)![2]) }
    const node = { x: Number(transform[1]), y: Number(transform[2]) }

    expect(end.y).toBeCloseTo(node.y + NODE_HEIGHT / 2, 0)
    expect([node.x, node.x + NODE_WIDTH]).toContainEqual(end.x)
  })

  it('ファイル粒度では import を特別扱いしない', () => {
    const { wrapper } = setup()

    expect(wrapper.findAll('path.edge.implements')).toHaveLength(0)
    expect(wrapper.findAll('circle.via-dot')).toHaveLength(0)
  })
})

describe('粒度を切り替えたときの視点', () => {
  it('図の大きさが変わるので、全体表示に合わせ直す', async () => {
    const { state, wrapper } = setup()
    const canvas = wrapper.vm as unknown as { viewport: { scale: number } }
    const before = canvas.viewport.scale

    state.setGranularity('method')
    await wrapper.vm.$nextTick()

    expect(canvas.viewport.scale).not.toBe(before)
  })

  it('切り替えたあとも、いちばん下のノードが画面に入る', async () => {
    const { state, wrapper } = setup()
    state.setGranularity('method')
    await wrapper.vm.$nextTick()

    const canvas = wrapper.vm as unknown as { viewport: { scale: number; y: number } }
    const bottoms = wrapper.findAll('g.node').map((node) => {
      const y = /translate\([^,]+,([\d.]+)\)/.exec(node.attributes('transform') ?? '')?.[1]
      return Number(y ?? 0)
    })

    // ノードの上辺ではなく下辺で見る。上辺だけだと、下が切れていても通る
    const lowest = (Math.max(...bottoms) + NODE_HEIGHT) * canvas.viewport.scale + canvas.viewport.y
    expect(lowest).toBeLessThanOrEqual(CANVAS.height)
  })
})

describe('並べ方（US-04 / UT-08）', () => {
  it('層にすると、列の見出しが層の名前になる', () => {
    const { wrapper } = setup()
    const heads = wrapper.findAll('text.head').map((text) => text.text())

    const names = viewModel.layerKeys.map((key) => viewModel.layerOfKey(key)?.name ?? '層なし')
    for (const head of heads) expect(names).toContain(head)
  })

  it('深度にすると、列の見出しが深度になる', async () => {
    const { state, wrapper } = setup()
    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    const heads = wrapper.findAll('text.head').map((text) => text.text())

    expect(heads[0]).toBe('深度 0（起点）')
    for (const head of heads.slice(1)) expect(head).toMatch(/^深度 (\d+|未定)$/)
  })

  it('深度の列は、浅いほうから順に並ぶ', async () => {
    const { state, wrapper } = setup()
    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    /*
     * ラベルそのものを左から順に固定する。x は列番号の並び順から機械的に
     * 振られる（layout.ts）ので、「x で並べ替えたら DOM 順と同じ」は恒真で、
     * 番号の付け方が壊れても気付けない
     */
    const labels = wrapper.findAll('g.head-group').map((group) => group.find('text.head').text())

    expect(labels).toEqual(['深度 0（起点）', '深度 1', '深度 2', '深度 3'])
  })

  it('深度未定のノードは、いちばん右の列へまとまる', async () => {
    const { state, wrapper } = setup()
    // 起点を 1 件に絞ると、たどり着けないノードが出る
    state.columnAxis = 'depth'
    state.select(viewModel.nodes.file[0]!.id)
    await wrapper.vm.$nextTick()

    const heads = wrapper.findAll('g.head-group').map((group) => ({
      x: Number(/translate\(([\d.-]+),/.exec(group.attributes('transform') ?? '')?.[1] ?? 0),
      label: group.find('text.head').text(),
    }))
    const rightmost = heads.reduce((a, b) => (a.x >= b.x ? a : b))

    expect(rightmost.label).toBe('深度未定')
  })

  it('軸を変えてもノードは 1 つも消えない（N-2）', async () => {
    const { state, wrapper } = setup()
    const before = wrapper.findAll('g.node').length

    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    // 並べる軸であって、表示範囲を絞る手段ではない
    expect(wrapper.findAll('g.node').length).toBe(before)
  })

  it('ノードの色帯は層のまま。軸では変わらない', async () => {
    const { state, wrapper } = setup()
    const target = viewModel.nodes.file[1]!.id
    const colourOf = () => wrapper.find(`[data-node-id="${target}"]`).attributes('style') ?? ''
    const before = colourOf()

    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    expect(colourOf()).toBe(before)
  })

  it('粒度を切り替えても、軸の設定で破綻しない', async () => {
    const { state, wrapper } = setup()
    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    state.setGranularity('method')
    await wrapper.vm.$nextTick()

    expect(state.columnAxis).toBe('depth')
    expect(wrapper.findAll('g.node').length).toBe(viewModel.nodes.method.length)
    expect(wrapper.findAll('text.head')[0]!.text()).toBe('深度 0（起点）')
  })
})

describe('列の割り当てを作り直す条件（UT-08）', () => {
  it('層軸では、選択が変わっても作り直さない', async () => {
    // 起点が選択で変わるのは深度軸の規則（ADR-001）。層軸では答えが同じなので、
    // ここで作り直すと配置と表示物の再計算が丸ごと無駄になる
    const spy = vi.spyOn(columnAxis, 'buildColumnPlan')
    try {
      const { state, wrapper } = setup()
      await wrapper.vm.$nextTick()
      const before = spy.mock.calls.length

      state.select(viewModel.nodes.file[2]!.id)
      await wrapper.vm.$nextTick()

      expect(spy.mock.calls.length).toBe(before)
    } finally {
      spy.mockRestore()
    }
  })

  it('深度軸では、選択が変わったら作り直す', async () => {
    const { state, wrapper } = setup()
    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    const spy = vi.spyOn(columnAxis, 'buildColumnPlan')
    try {
      const before = spy.mock.calls.length

      state.select(viewModel.nodes.file[2]!.id)
      await wrapper.vm.$nextTick()

      expect(spy.mock.calls.length).toBeGreaterThan(before)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('並べ方を切り替えたときの視点（UT-08）', () => {
  it('列の形が変わるので、全体表示に合わせ直す', async () => {
    const { state, wrapper } = setup()
    const canvas = wrapper.vm as unknown as { viewport: { scale: number; x: number } }
    const before = { ...canvas.viewport }

    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    expect({ scale: canvas.viewport.scale, x: canvas.viewport.x }).not.toEqual({
      scale: before.scale,
      x: before.x,
    })
  })

  it('切り替えたあとも、いちばん下のノードが画面に入る', async () => {
    const { state, wrapper } = setup()
    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    const canvas = wrapper.vm as unknown as { viewport: { scale: number; y: number } }
    const bottoms = wrapper.findAll('g.node').map((node) => {
      const y = /translate\([^,]+,([\d.]+)\)/.exec(node.attributes('transform') ?? '')?.[1]
      return Number(y ?? 0)
    })

    const lowest = (Math.max(...bottoms) + NODE_HEIGHT) * canvas.viewport.scale + canvas.viewport.y
    expect(lowest).toBeLessThanOrEqual(CANVAS.height)
  })

  it('深度軸で選択が変わっても、全体表示に戻さない', async () => {
    // 起点が変わるので図の形は変わるが、ここで戻すと寄せる操作を毎回上書きする
    const { state, wrapper } = setup()
    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    const canvas = wrapper.vm as unknown as { viewport: { scale: number; x: number; y: number } }
    const before = { ...canvas.viewport }

    state.select(viewModel.nodes.file[3]!.id)
    await wrapper.vm.$nextTick()

    expect({ ...canvas.viewport }).toEqual(before)
  })

  it('軸を切り替えても選択を見失わない', async () => {
    const { state, wrapper } = setup()
    const target = viewModel.nodes.file[2]!.id
    state.select(target)
    await wrapper.vm.$nextTick()

    state.columnAxis = 'depth'
    await wrapper.vm.$nextTick()

    expect(state.selectedNodeId).toBe(target)
    expect(wrapper.find(`[data-node-id="${target}"]`).classes()).toContain('selected')
  })
})

describe('見出しの切り詰め', () => {
  it('ノードに、切り詰める前の全文を重ねる', () => {
    const { wrapper } = setup()
    // 2 行目に収まらない長さのパス。図の上では先頭が落ちる
    const path = 'src/presentation/TodoListController.ts'
    const node = wrapper.find(`[data-node-id="file:${path}"]`)

    expect(node.find('.path').text()).not.toContain('src/presentation')
    expect(node.find('title').text()).toContain(path)
  })

  it('同じクラスの別メソッドが、同じラベルにならない', () => {
    const { wrapper } = setup({ granularity: 'method' })

    const names = wrapper.findAll('text.name').map((text) => text.text())
    expect(new Set(names).size).toBe(names.length)
  })

  it('削るのは owner 側。メソッド名は残す', () => {
    const { wrapper } = setup({ granularity: 'method' })
    const names = wrapper.findAll('text.name').map((text) => text.text())

    const truncated = names.filter((name) => name.includes('…'))
    expect(truncated.length).toBeGreaterThan(0)
    // 切り詰めても末尾のメソッド名は読める
    expect(truncated.every((name) => !name.endsWith('…'))).toBe(true)
  })
})

describe('経由の呼び出しが依っている前提', () => {
  it('実装は implements のエッジで必ずたどれる', () => {
    const via = viewModel.edges.method.filter(
      (edge) => 'resolution' in edge && edge.resolution === 'via-interface',
    )
    const implementsByTarget = new Map<string, Set<string>>()
    for (const edge of viewModel.edges.method) {
      if (edge.kind !== 'implements') continue
      const bucket = implementsByTarget.get(edge.to) ?? new Set<string>()
      bucket.add(edge.from)
      implementsByTarget.set(edge.to, bucket)
    }

    /*
     * 経由の呼び出しはインターフェース宛に描き、実装は `implements` の
     * エッジが持つ（UT-07 決定事項）。覆われない実装があると、
     * 「実装が失われない形で表示される」が無警告で破れる。
     */
    const uncovered = via.flatMap((edge) =>
      ('implementations' in edge ? (edge.implementations ?? []) : []).filter(
        (implementation) => !implementsByTarget.get(edge.to)?.has(implementation),
      ),
    )

    expect(via.length).toBeGreaterThan(0)
    expect(uncovered).toEqual([])
  })
})

describe('選択による絞り込み（US-12 / UT-14）', () => {
  /** 依存先も依存元も持つファイル */
  const hub = viewModel.nodes.file.find(
    (node) =>
      viewModel.dependenciesOf(node.id, 'file').length > 0 &&
      viewModel.fanInOf(node.id, 'file') > 0,
  )!

  const shown = (wrapper: ReturnType<typeof setup>['wrapper']) =>
    wrapper.findAll('g.node').map((node) => node.attributes('data-node-id')!)

  it('絞り込みを立てるまでは、全部出る', async () => {
    const { state, wrapper } = setup()
    state.select(hub.id)
    await wrapper.vm.$nextTick()

    expect(shown(wrapper)).toHaveLength(viewModel.nodes.file.length)
  })

  it('立てると、選んだノードと直接の相手だけが残る', async () => {
    const { state, wrapper } = setup()
    state.select(hub.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    const ids = shown(wrapper)
    expect(ids).toContain(hub.id)
    expect(ids.length).toBeLessThan(viewModel.nodes.file.length)
    for (const id of ids) {
      if (id === hub.id) continue
      const touching = viewModel.edges.file.some(
        (edge) =>
          (edge.from === hub.id && edge.to === id) || (edge.to === hub.id && edge.from === id),
      )
      expect(touching, id).toBe(true)
    }
  })

  it('関係しないノードは薄くするのではなく消す', async () => {
    const { state, wrapper } = setup()
    state.select(hub.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    const gone = viewModel.nodes.file.find((node) => !shown(wrapper).includes(node.id))!
    expect(wrapper.find(`[data-node-id="${gone.id}"]`).exists()).toBe(false)
  })

  it('選んだノードを介さない線は描かない', async () => {
    const { state, wrapper } = setup()
    state.select(hub.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    for (const path of wrapper.findAll('path[data-edge-id]')) {
      const edge = viewModel.edgeById.get(path.attributes('data-edge-id')!)!
      expect(edge.from === hub.id || edge.to === hub.id).toBe(true)
    }
  })

  it('空になった列は詰める', async () => {
    const { state, wrapper } = setup()
    const before = wrapper.findAll('g.head-group').length

    state.select(hub.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('g.head-group').length).toBeLessThan(before)
  })

  it('解くと戻る', async () => {
    const { state, wrapper } = setup()
    state.select(hub.id)
    state.setNarrowedToSelection(true)
    await wrapper.vm.$nextTick()
    state.setNarrowedToSelection(false)
    await wrapper.vm.$nextTick()

    expect(shown(wrapper)).toHaveLength(viewModel.nodes.file.length)
  })
})
