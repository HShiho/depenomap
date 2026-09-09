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

import type { GraphNode } from '@/core/graph/schema'
import { NO_LAYER, type LayerKey } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'
import { edgePath } from './edge-path'
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

const layout = computed(() => {
  const viewModel = state.viewModel
  if (!viewModel) return buildLayout({ nodes: [], edges: [], columnOf: () => 0 })

  return buildLayout({
    nodes: viewModel.nodes.file,
    edges: viewModel.edges.file,
    // 層が未設定のノードは末尾の列へ。層が無いこと自体は欠陥ではない（ADR-002 / N-1）
    columnOf: (node) =>
      columnOfLayer.value.get(viewModel.layerOf(node.id).key) ?? LAYER_COLOURS * 99,
  })
})

const positions = computed(
  () => new Map(layout.value.nodes.map((placed) => [placed.node.id, placed])),
)

const edges = computed(() =>
  (state.viewModel?.edges.file ?? []).flatMap((edge) => {
    const from = positions.value.get(edge.from)
    const to = positions.value.get(edge.to)
    // 位置が引けないエッジは描かない。参照整合性は UT-01 が保証済みで、
    // ここに来るのは絞り込み（UT-14）で片側が消えている場合だけ
    if (!from || !to) return []
    return [{ id: edge.id, d: edgePath(from, to) }]
  }),
)

/** 列見出し。層の名前は JSON の定義から取る（ビューアは推測しない / ADR-002） */
const columnHeads = computed(() => {
  const viewModel = state.viewModel
  if (!viewModel) return []

  return layout.value.columns.map((column) => {
    const key = viewModel.layerKeys[column.column]
    const layer = key === undefined ? undefined : viewModel.layerOfKey(key)
    return {
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

function pathOf(node: GraphNode): string {
  return node.kind === 'file' ? node.path : node.name
}

function statsOf(node: GraphNode): string {
  const viewModel = state.viewModel
  if (!viewModel) return ''
  const fanIn = viewModel.fanInOf(node.id, 'file')
  const fanOut = viewModel.dependenciesOf(node.id, 'file').length
  return `↙${fanIn} ↗${fanOut}`
}

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

/*
 * 図が入れ替わったら全体表示に戻す。読み込み直後は「どこを見ているか」の
 * 前提が無く、前のグラフの位置を保っても意味を持たない。
 */
watch(
  () => layout.value.width + layout.value.height,
  (size) => {
    if (size > 0) fitToContent()
  },
  { immediate: true },
)
</script>

<template>
  <svg
    class="canvas"
    :width="state.canvasWidth"
    :height="state.canvasHeight"
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
    </defs>

    <g :transform="transformOf(viewport)">
      <!-- 列見出し。層の名前は JSON の定義（ADR-002） -->
      <g v-for="head in columnHeads" :key="head.label" :transform="`translate(${head.x},0)`">
        <rect y="30" width="3" height="14" rx="2" :fill="head.colour" />
        <text x="10" y="42" class="head">{{ head.label }}</text>
        <text x="10" y="56" class="head-count">{{ head.count }}</text>
      </g>

      <g class="edges">
        <path
          v-for="edge in edges"
          :key="edge.id"
          :d="edge.d"
          class="edge"
          marker-end="url(#arrow)"
        />
      </g>

      <g
        v-for="placed in layout.nodes"
        :key="placed.node.id"
        class="node"
        :class="{ selected: placed.node.id === state.selectedNodeId }"
        :style="{ '--lc': layerColour(state.viewModel?.layerOf(placed.node.id).key) }"
        :transform="`translate(${placed.x},${placed.y})`"
        @click.stop="onNodeClick(placed.node)"
        @contextmenu="emit('nodeContextMenu', placed.node, $event)"
      >
        <rect class="box" :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="9" />
        <!-- 層の色帯。上下に余白を残した短い帯（参照仕様） -->
        <rect class="bar" x="1" y="9" width="3.5" :height="NODE_HEIGHT - 18" rx="2" />
        <text x="14" y="23" class="name">{{ truncateName(placed.node.name) }}</text>
        <text x="14" y="38" class="path">{{ truncatePath(pathOf(placed.node)) }}</text>
        <text :x="NODE_WIDTH - 10" y="38" class="stat" text-anchor="end">
          {{ statsOf(placed.node) }}
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

/* エッジ。種類による描き分けは UT-09 / UT-10 が足す */
.edge {
  fill: none;
  stroke: var(--color-ink-3);
  stroke-width: var(--edge-stroke);
  opacity: var(--edge-opacity);
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
