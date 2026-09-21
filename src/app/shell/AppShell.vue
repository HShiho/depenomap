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

/**
 * 画面全体に重なるものが出ているか（UT-13）。
 *
 * **`inert` は `undefined` に落として渡す。** Vue は `key in el` で属性か
 * プロパティかを決める（`shouldSetAsProp`）。`inert` を持つブラウザでは
 * `el.inert = false` になるので属性は出ないが、**`inert` を実装していない
 * jsdom では `inert="false"` という属性が出る**。HTML の `inert` は値に
 * 関わらず属性があれば効くので、その形のままだと「触れるかどうか」を
 * 属性で見る検査が書けない。`undefined` なら、どちらでも属性が消える。
 *
 * 出ているあいだ、3 領域を `inert` にする。**覆いは見た目だけで、裏は生きている** —
 * Tab で裏の入力欄へ抜けられ、そこで押した Esc は裏の側が先に受け取る。
 * 一覧の折りたたみ（`sidebarOpen`）が同じやり方で裏を殺しているので、それに揃える。
 */
defineProps<{ sheetOpen?: boolean }>()

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
    <!--
      画面の見出し。参照仕様は上部に帯を持たず、アプリ名を出す場所が無いため
      読み上げにだけ出す。見出しが無いと、支援技術からページの主題が辿れない
    -->
    <h1 class="sr-only">depenomap</h1>

    <nav
      class="shell-rail border-r border-line bg-surface"
      :inert="sheetOpen || undefined"
      aria-label="表示の切り替え"
    >
      <slot name="rail" />
    </nav>

    <!--
      折りたたんだときは幅 0 になる。`hidden` ではなく幅で畳むのは、
      開閉のあいだキャンバスが連続して広がるようにするため（US-08 の受け皿）
    -->
    <aside
      class="shell-panel border-r border-line bg-surface"
      :inert="!state.sidebarOpen || sheetOpen || undefined"
      aria-label="ファイル / メソッドの一覧"
    >
      <slot name="sidebar" />
    </aside>

    <main
      ref="canvas"
      class="shell-canvas bg-ground"
      :inert="sheetOpen || undefined"
      aria-label="ノードマップ"
    >
      <slot name="canvas" />

      <div class="shell-overlay">
        <slot name="canvas-overlay" />
      </div>

      <!-- 読み込みの結果（失敗の理由・警告）はここに出す -->
      <div class="shell-notice">
        <slot name="notice" />
      </div>

      <!--
        下端の帯。左に図の読み方（凡例 / UT-26）、中央にツールバー。

        **1 つの器に入れて並べる。** それぞれを絶対位置で置くと、幅が狭いとき
        に重なり、あとに置いたほうがポインタを奪う。並べておけば、重ならない
        ことが配置そのもので決まる。
      -->
      <div class="shell-bottom">
        <div class="shell-legend">
          <slot name="canvas-legend" />
        </div>

        <div class="shell-toolbar">
          <slot name="toolbar" />
        </div>

        <!-- ツールバーを中央に保つための釣り合い。中身は持たない -->
        <div aria-hidden="true"></div>
      </div>
    </main>

    <!--
      画面全体に重なるもの（概要 / UT-13）。列の中ではなくシェルの外に置く。
      キャンバスの中に入れると、一覧の開閉で幅が変わるたびに中身が動く
    -->
    <slot name="sheet" />
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

/*
 * キャンバスに重ねる要素。位置だけを決め、中身の見た目は差し込む側が持つ。
 *
 * **ポインタは透かす**（`mockup.html` の `.overlay` と同じ）。透かさないと、
 * 中身が入った時点で重なった範囲がキャンバスの操作（UT-16 のパン・ズーム）を
 * 横取りする。差し込む中身の側で `pointer-events: auto` に戻す。
 */
.shell-overlay,
.shell-notice,
.shell-bottom {
  position: absolute;
  z-index: 1;
  pointer-events: none;
}

.shell-overlay > :deep(*),
.shell-notice > :deep(*),
.shell-legend > :deep(*),
.shell-toolbar > :deep(*) {
  pointer-events: auto;
}

.shell-overlay {
  top: var(--overlay-inset);
  left: var(--overlay-inset);
}

.shell-notice {
  top: var(--overlay-inset);
  right: var(--overlay-inset);
}

/*
 * 下端の帯。**左（凡例）と中央（ツールバー）を並べて置く。**
 *
 * 両端の列を同じ幅（`1fr`）にすることで、ツールバーはキャンバスの中央に立つ。
 * 幅が足りなくなると、まず両端の列が縮み、最後にツールバー自身が縮む。
 * どの幅でも重ならない。
 */
.shell-bottom {
  right: var(--overlay-inset);
  bottom: var(--toolbar-inset);
  left: var(--overlay-inset);
  display: grid;
  grid-template-columns: 1fr max-content 1fr;
  align-items: end;
  gap: var(--overlay-inset);
}

.shell-legend {
  min-width: 0;
}

/* 全幅の帯にすると、幅いっぱいがキャンバスの操作を覆う */
.shell-toolbar {
  min-width: 0;
}
</style>
