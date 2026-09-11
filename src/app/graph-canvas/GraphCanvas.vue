<script setup lang="ts">
/**
 * ノードマップの描画（UT-06）。
 *
 * ファイルをノード、依存を矢印として描く（US-01）。矢印は「使う側 → 使われる側」。
 * **構成の良し悪しで表示を変えない**。層をまたぐ依存も同じ矢印で描く（N-1）。
 *
 * 配置（`layout.ts`）・経路（`edge-path.ts`）・座標変換（`viewport.ts`）は
 * それぞれ純粋関数に出してある。ここが持つのは、状態の器（UT-05）から
 * 読んだ値をそれらへ渡し、SVG を組み立てて、操作を器へ返すところだけ。
 */
import { computed, ref, watch } from 'vue'

import type { GraphEdge, GraphNode } from '@/core/graph/schema'
import { NO_LAYER, type Granularity, type LayerKey, type ViewModel } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'
import { edgeMidpoint, edgePath } from './edge-path'
import { buildLayout, NODE_HEIGHT, NODE_WIDTH } from './layout'
import { centreOn, fit, transformOf, type Viewport } from './viewport'

const state = useViewState()

/** 層カラーは 6 色を循環させる。層 ID には結び付けない（UT-04 の決定） */
const LAYER_COLOURS = 6

/** ノード内の識別子とパスは、この長さで切り詰める（参照仕様） */
const NAME_LIMIT = 22
const PATH_LIMIT = 24

const viewport = ref<Viewport>({ x: 0, y: 0, scale: 1 })

/** 層のキー → 列番号。正本 JSON の並び順がそのまま列の並びになる（ADR-002） */
const columnOfLayer = computed(() => {
  const keys = state.viewModel?.layerKeys ?? []
  return new Map<LayerKey, number>(keys.map((key, index) => [key, index]))
})

/**
 * 列の中の**初期の**並び。
 *
 * メソッド粒度では所属ファイル → ソース上の行で並べる。同じファイルの処理が
 * 近くから始まるほうが、読み始めの手がかりになる。ただし最終的な並びは
 * 交差削減（`layout.ts`）が決めるため、**隣接は保証しない**。
 *
 * 所属そのものはノードの 2 行目（所属ファイルのパス）で示す（US-02）。囲み枠で
 * 束ねると層の列と入れ子になり、線が読めなくなる。
 */
function sortKeyOf(node: GraphNode): string {
  if (node.kind === 'file') return node.path
  const line = String(node.loc.line).padStart(6, '0')
  return `${node.parent}#${line}`
}

const layout = computed(() => {
  const viewModel = state.viewModel
  if (!viewModel) return buildLayout({ nodes: [], edges: [], columnOf: () => 0 })

  return buildLayout({
    nodes: viewModel.nodes[state.granularity],
    edges: viewModel.edges[state.granularity],
    // 層が未設定のノードは末尾の列へ。層が無いこと自体は欠陥ではない（ADR-002 / N-1）
    columnOf: (node) =>
      columnOfLayer.value.get(viewModel.layerOf(node.id).key) ?? LAYER_COLOURS * 99,
    sortKeyOf,
  })
})

const positions = computed(
  () => new Map(layout.value.nodes.map((placed) => [placed.node.id, placed])),
)

/**
 * エッジの見た目の区別（UT-07）。
 *
 * **依存の良し悪しではなく、依存の形を表す**（N-1）。層をまたぐかどうかで
 * 区別しない。
 *
 *   - `implements`: クラスとインターフェースの対応。破線
 *   - `via`: インターフェースを経由する呼び出し。アクセント色と中点の印
 *   - `plain`: それ以外
 *
 * `via-interface` の呼び出しは**型検査器の答え（インターフェース宛）に描く**。
 * 実装との対応は `implements` のエッジが別に持つため、図の上で両方たどれる
 * （UT-07 決定事項。論理／実の切り替えは設けない — 切り替えると、見ているあいだ
 * もう一方が消える）。
 */
type EdgeVariant = 'plain' | 'implements' | 'via'

function variantOf(edge: GraphEdge): EdgeVariant {
  if (edge.kind === 'implements') return 'implements'
  if ('resolution' in edge && edge.resolution === 'via-interface') return 'via'
  return 'plain'
}

const edges = computed(() =>
  (state.viewModel?.edges[state.granularity] ?? []).flatMap((edge) => {
    const from = positions.value.get(edge.from)
    const to = positions.value.get(edge.to)
    // 位置が引けないエッジは描かない。参照整合性は UT-01 が保証済みで、
    // ここに来るのは絞り込み（UT-14）で片側が消えている場合だけ
    if (!from || !to) return []

    const options = { selfLoop: edge.from === edge.to }
    const variant = variantOf(edge)
    return [
      {
        id: edge.id,
        variant,
        d: edgePath(from, to, options),
        // 経由の印は曲線上に置く。端点の中間だと線から離れて浮く
        midpoint: variant === 'via' ? edgeMidpoint(from, to, options) : undefined,
      },
    ]
  }),
)

/**
 * 列見出し。層の名前は JSON の定義から取る（ビューアは推測しない / ADR-002）。
 *
 * **ノードが 1 件も無い層は列に出ない**（UT-06 決定事項）。列は「ノードの置き場」
 * であって層の一覧ではなく、空の列を残すと絞り込み（UT-14）のたびに図が横へ
 * 間延びする。
 *
 * 代償として、**定義だけあってノードが 0 件の層は画面から見えない**。これを
 * 引き受ける先は凡例（参照仕様の `.legend`）だが、まだ実装されていない。
 * 載せるときは `layerKeys`（空の層も残る）から作る。
 */
const columnHeads = computed(() => {
  const viewModel = state.viewModel
  if (!viewModel) return []

  return layout.value.columns.map((column) => {
    const key = viewModel.layerKeys[column.column]
    const layer = key === undefined ? undefined : viewModel.layerOfKey(key)
    return {
      // 層の名前は一意とは限らない（正本 JSON が保証しているのは id だけ）。
      // 差分更新のキーには、構造上一意な列番号を使う
      column: column.column,
      x: column.x,
      count: column.count,
      label: layer?.name ?? '層なし',
      colour: layerColour(key),
    }
  })
})

function layerColour(key: LayerKey | undefined): string {
  if (key === undefined || key === NO_LAYER) return 'var(--color-ink-3)'
  const index = columnOfLayer.value.get(key) ?? 0
  return `var(--color-layer-${(index % LAYER_COLOURS) + 1})`
}

function truncateName(value: string): string {
  return value.length > NAME_LIMIT ? `${value.slice(0, NAME_LIMIT - 1)}…` : value
}

/** パスは先頭を落とす。末尾（ファイルに近いほう）のほうが見分けに効く */
function truncatePath(value: string): string {
  return value.length > PATH_LIMIT ? `…${value.slice(value.length - PATH_LIMIT + 1)}` : value
}

/**
 * ノードの見出し。メソッドは `owner.name`（例 `TodoController.post`）にする。
 * トップレベル関数は `owner` を持たないため名前だけ（スキーマ §3）。
 */
function titleOf(node: GraphNode): string {
  if (node.kind === 'file') return node.name
  return node.owner === null ? node.name : `${node.owner}.${node.name}`
}

/**
 * ノードの 2 行目。**メソッドは所属ファイルのパス**を出す（US-02）。
 * どのファイルの処理なのかが、ノード単体で分かる必要がある。
 */
function subtitleOf(node: GraphNode): string {
  if (node.kind === 'file') return node.path
  return state.viewModel?.fileOfMethod(node.id)?.path ?? ''
}

/**
 * 被依存数と依存数。**どちらもノード単位で数える**。
 *
 * `fanInOf` は同じ 2 ノード間に何本エッジがあっても 1 と数える（UT-02 決定事項）
 * のに対し、`dependenciesOf` はエッジ 1 本につき 1 件返す。そのまま並べると
 * 「使われている数」と「使っている数」で単位が違い、同じ図の中で数が噛み合わない。
 * 型の import と値の import が別エッジになる抽出結果では実際に起きる。
 */
function statsOf(node: GraphNode): string {
  const viewModel = state.viewModel
  if (!viewModel) return ''
  const fanIn = viewModel.fanInOf(node.id, state.granularity)
  const fanOut = new Set(
    viewModel.dependenciesOf(node.id, state.granularity).map((dependency) => dependency.node.id),
  ).size
  return `↙${fanIn} ↗${fanOut}`
}

/**
 * ノード 1 つぶんの表示物。**配置が変わったときだけ作り直す**。
 *
 * テンプレートから `statsOf` を直接呼ぶと、選択が変わるだけの再描画でも
 * 全ノードぶんの数え直し（依存のたどりと並べ替え）が走る。規模が大きい正本
 * JSON では、クリックのたびにその計算を払うことになる。
 */
const nodeVisuals = computed(() => {
  const visuals = new Map<string, { name: string; path: string; stat: string; colour: string }>()
  const viewModel = state.viewModel
  if (!viewModel) return visuals

  for (const placed of layout.value.nodes) {
    const node = placed.node
    visuals.set(node.id, {
      name: truncateName(titleOf(node)),
      path: truncatePath(subtitleOf(node)),
      stat: statsOf(node),
      colour: layerColour(viewModel.layerOf(node.id).key),
    })
  }
  return visuals
})

/* --- 操作の口。後続 UT はここから受け取る ---------------------------- */

const emit = defineEmits<{
  /** ノードの右クリック（UT-18 が「VSCode で開く」を載せる） */
  nodeContextMenu: [node: GraphNode, event: MouseEvent]
}>()

function onNodeClick(node: GraphNode): void {
  state.select(node.id)
}

function onBackgroundClick(): void {
  state.clearSelection()
}

/* --- ビューポート操作の口（UT-16 / UT-14 / UT-11 が使う） -------------- */

const view = computed(() => ({ width: state.canvasWidth, height: state.canvasHeight }))

function fitToContent(): void {
  viewport.value = fit({ width: layout.value.width, height: layout.value.height }, view.value)
}

function focusNode(nodeId: string): void {
  const placed = positions.value.get(nodeId)
  if (placed) viewport.value = centreOn(viewport.value, placed, view.value)
}

defineExpose({ viewport, fitToContent, focusNode })

/**
 * 最後に全体表示を合わせた対象。**グラフと粒度の組につき 1 回だけ**合わせる。
 *
 * 粒度を切り替えると図の大きさが変わる（メソッド粒度はフィクスチャで縦に
 * 約 2.7 倍）。視点を据え置くと、切り替えた瞬間に下半分が画面の外へ出る。
 * パンの手段が載るのは UT-16 なので、いまは戻す方法が無い。
 *
 * リサイズのたびに合わせ直すと、寄せた位置（`focusNode`）やこの先のパン・
 * ズーム（UT-16）が、ウィンドウの変形やサイドバーの開閉で毎回巻き戻る。
 * 一覧の開閉には 0.18 秒のアニメーションがあり、そのあいだ実寸が連続して
 * 変わるため、図が動き続けることになる。
 *
 * 「合わせたか」を真偽値で持ち、解除を別の `watch` に置くと、2 つの watch の
 * **登録順**が正しさの条件になる。合わせた対象そのものを覚えておけば、
 * 判定が 1 つの式で閉じる。
 */
let lastFitted: { viewModel: ViewModel | undefined; granularity: Granularity } | undefined

/*
 * 図が入れ替わったら全体表示に戻す。読み込み直後は「どこを見ているか」の
 * 前提が無く、前のグラフの位置を保っても意味を持たない。
 *
 * **キャンバスの実寸も一緒に見る。** グラフが実寸の観測より先に届くと、
 * そのときの画面は 0×0 で全体表示が成立せず、あとからサイズが入っても
 * 等倍・左上のまま固定されてしまう。両方が揃った最初の時点で合わせ、
 * 以降のリサイズでは動かさない。
 */
watch(
  () =>
    [
      state.viewModel,
      state.granularity,
      layout.value.width,
      layout.value.height,
      view.value.width,
      view.value.height,
    ] as const,
  ([viewModel, granularity, contentWidth, contentHeight, viewWidth, viewHeight]) => {
    const ready = contentWidth > 0 && contentHeight > 0 && viewWidth > 0 && viewHeight > 0
    if (!ready) return
    const fitted = lastFitted
    if (fitted && fitted.viewModel === viewModel && fitted.granularity === granularity) return

    lastFitted = { viewModel, granularity }
    fitToContent()
  },
  { immediate: true },
)
</script>

<template>
  <!--
    実寸が観測できない環境（`ResizeObserver` が無い）では 0 になる。その場合は
    領域いっぱいに広げる。全体表示は効かないが、図そのものは見える
  -->
  <svg
    class="canvas"
    :width="state.canvasWidth || '100%'"
    :height="state.canvasHeight || '100%'"
    @click="onBackgroundClick"
  >
    <defs>
      <!-- 矢尻。線と同じ色トークンを使う（UT-04） -->
      <marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,1 L10,5 L0,9 z" fill="var(--color-ink-3)" />
      </marker>

      <!-- 経由の呼び出し。線と同じ色にする -->
      <marker
        id="arrow-via"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,1 L10,5 L0,9 z" fill="var(--color-accent)" />
      </marker>
    </defs>

    <g :transform="transformOf(viewport)">
      <!-- 列見出し。層の名前は JSON の定義（ADR-002） -->
      <g v-for="head in columnHeads" :key="head.column" :transform="`translate(${head.x},0)`">
        <rect y="30" width="3" height="14" rx="2" :fill="head.colour" />
        <text x="10" y="42" class="head">{{ head.label }}</text>
        <text x="10" y="56" class="head-count">{{ head.count }}</text>
      </g>

      <g class="edges">
        <template v-for="edge in edges" :key="edge.id">
          <path
            :d="edge.d"
            class="edge"
            :class="edge.variant"
            :marker-end="edge.variant === 'via' ? 'url(#arrow-via)' : 'url(#arrow)'"
          />
          <!-- 経由であることの印。インターフェース宛であることを線の上で示す -->
          <circle
            v-if="edge.midpoint"
            class="via-dot"
            :cx="edge.midpoint.x"
            :cy="edge.midpoint.y"
            r="3.4"
          />
        </template>
      </g>

      <g
        v-for="placed in layout.nodes"
        :key="placed.node.id"
        class="node"
        :class="{ selected: placed.node.id === state.selectedNodeId }"
        :style="{ '--lc': nodeVisuals.get(placed.node.id)?.colour }"
        :transform="`translate(${placed.x},${placed.y})`"
        @click.stop="onNodeClick(placed.node)"
        @contextmenu="emit('nodeContextMenu', placed.node, $event)"
      >
        <rect class="box" :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="9" />
        <!-- 層の色帯。上下に余白を残した短い帯（参照仕様） -->
        <rect class="bar" x="1" y="9" width="3.5" :height="NODE_HEIGHT - 18" rx="2" />
        <text x="14" y="23" class="name">{{ nodeVisuals.get(placed.node.id)?.name }}</text>
        <text x="14" y="38" class="path">{{ nodeVisuals.get(placed.node.id)?.path }}</text>
        <text :x="NODE_WIDTH - 10" y="38" class="stat" text-anchor="end">
          {{ nodeVisuals.get(placed.node.id)?.stat }}
        </text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.canvas {
  display: block;
}

/* 列見出し */
.head {
  font-family: var(--font-sans);
  font-size: var(--text-label);
  fill: var(--color-ink-2);
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.head-count {
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  fill: var(--color-ink-3);
}

/* エッジ。循環の描き分けは UT-10 が足す */
.edge {
  fill: none;
  stroke: var(--color-ink-3);
  stroke-width: var(--edge-stroke);
  opacity: var(--edge-opacity);
}

/* クラスとインターフェースの対応。線の形で区別し、色では区別しない（N-1） */
.edge.implements {
  stroke-width: var(--edge-stroke-implements);
  stroke-dasharray: var(--edge-dash-implements);
  opacity: var(--edge-opacity-implements);
}

/* インターフェースを経由する呼び出し */
.edge.via {
  stroke: var(--color-accent);
  stroke-width: var(--edge-stroke-via);
}

.via-dot {
  fill: var(--color-surface);
  stroke: var(--color-accent);
  stroke-width: 1.6;
}

/* ノード。塗りは層の色を混ぜ、状態は枠線だけで表す（参照仕様） */
.node {
  cursor: pointer;
}

.node .box {
  fill: color-mix(in srgb, var(--lc) var(--tint), var(--color-surface));
  stroke: color-mix(in srgb, var(--lc) 46%, var(--color-line));
  stroke-width: var(--node-stroke);
}

.node.selected .box {
  stroke: var(--color-accent);
  stroke-width: var(--node-stroke-selected);
}

.node .bar {
  fill: var(--lc);
}

.node .name {
  font-family: var(--font-mono);
  font-size: var(--text-ui);
  font-weight: 600;
  fill: var(--color-ink);
}

.node .path {
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  fill: var(--color-ink-3);
}

.node .stat {
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  fill: var(--color-ink-3);
  font-variant-numeric: tabular-nums;
}
</style>
