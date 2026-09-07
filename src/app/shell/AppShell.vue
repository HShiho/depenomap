<script setup lang="ts">
/**
 * 画面の骨格（UT-05）。
 *
 * 3 領域からなる。参照仕様（`mockup.html`）では画面上部に横帯を持たず、
 * **画面全体に効く操作は左端のレール**、**見え方の切り替えはキャンバス下部の
 * ツールバー**に置く。UT-05 ドキュメントの「トップバー」はこの 2 つに当たる。
 *
 * ```
 *   ┌────┬──────────┬──────────────────────┐
 *   │レール│ 一覧パネル  │ キャンバス              │
 *   │     │           │  ├ 左上のオーバーレイ     │
 *   │     │           │  ├ 通知（読み込みの結果）  │
 *   │     │           │  └ 下部ツールバー         │
 *   └────┴──────────┴──────────────────────┘
 * ```
 *
 * ここは**器だけ**を持ち、中身は各機能 UT がスロットへ差し込む。
 * キャンバスの実寸は観測して状態へ流す（描画側は状態を読むだけでよい）。
 */
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

import { defaultSizeObserverFactory, watchElementSize } from './canvas-size'
import { useViewState } from './view-state'

const state = useViewState()
const canvas = useTemplateRef<HTMLElement>('canvas')

let stopWatching: () => void = () => {}

onMounted(() => {
  if (canvas.value) {
    stopWatching = watchElementSize(canvas.value, state.setCanvasSize, defaultSizeObserverFactory())
  }
})

onBeforeUnmount(() => stopWatching())
</script>

<template>
  <div class="shell" :data-panel="state.sidebarOpen ? 'open' : 'closed'">
    <nav class="shell-rail border-r border-line bg-surface" aria-label="表示の切り替え">
      <slot name="rail" />
    </nav>

    <!--
      折りたたんだときは幅 0 になる。`hidden` ではなく幅で畳むのは、
      開閉のあいだキャンバスが連続して広がるようにするため（US-08 の受け皿）
    -->
    <aside
      class="shell-panel border-r border-line bg-surface"
      :inert="!state.sidebarOpen"
      aria-label="ファイル / メソッドの一覧"
    >
      <slot name="sidebar" />
    </aside>

    <div ref="canvas" class="shell-canvas bg-ground">
      <slot name="canvas" />

      <div class="shell-overlay">
        <slot name="canvas-overlay" />
      </div>

      <!-- 読み込みの結果（失敗の理由・警告）はここに出す -->
      <div class="shell-notice">
        <slot name="notice" />
      </div>

      <div class="shell-toolbar">
        <slot name="toolbar" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 列の幅はトークン（`--rail-width` / `--panel-width`）から取る。
 * 開閉は列幅の変化で表し、キャンバス側は `1fr` のまま追従する。
 */
.shell {
  display: grid;
  grid-template-columns: var(--rail-width) var(--panel-width) 1fr;
  height: 100dvh;
  min-height: 0;
  transition: grid-template-columns 0.18s ease;
}

.shell[data-panel='closed'] {
  grid-template-columns: var(--rail-width) 0 1fr;
}

.shell[data-panel='closed'] .shell-panel {
  border-right: none;
}

.shell-rail,
.shell-panel {
  min-width: 0;
  overflow: hidden;
}

.shell-canvas {
  position: relative;
  min-width: 0;
  overflow: hidden;
}

/* キャンバスに重ねる要素。位置だけを決め、中身の見た目は差し込む側が持つ */
.shell-overlay,
.shell-notice,
.shell-toolbar {
  position: absolute;
  z-index: 1;
}

.shell-overlay {
  top: 0;
  left: 0;
}

.shell-notice {
  top: 0;
  right: 0;
}

.shell-toolbar {
  right: 0;
  bottom: 0;
  left: 0;
}
</style>
