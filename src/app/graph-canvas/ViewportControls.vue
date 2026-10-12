<script setup lang="ts">
/**
 * 倍率の表示と、全体表示へ戻す口（UT-16 / US-16）。
 *
 * **上下限に当たったことが読めるように、倍率を出す。** 出さないと、ピンチが
 * 効かなくなったときに「操作が効いていない」のか「限界なのか」が区別できない。
 *
 * **読み上げの通知にはしない。** ホイール 1 目盛りごとに変わる値なので、
 * ライブリージョンにすると連続操作のあいだ通知が積み上がり、他の知らせが
 * 埋もれる。倍率は数として見えていれば足りる。
 *
 * 全体表示は、手で動かして迷子になったときに戻れる口。図が組み換わったときは
 * 自動で合わせ直す（`GraphCanvas`）ので、ここは**人が呼ぶときのため**にある。
 *
 * 配置のリセット（UT-17 / US-18）も同じ並びに置く。どちらも「図の見え方を
 * 元に戻す」操作で、探す場所が分かれていると片方を見落とす。
 *
 * **動かしていないときは押せない。** 押せるかどうかが、そのままリセットの
 * 効く状態を表す（UT-17 の完了条件）。
 */
import { MAX_SCALE, MIN_SCALE } from './viewport'

defineProps<{ scale: number; movedCount: number }>()

defineEmits<{ fit: []; resetPositions: []; zoomIn: []; zoomOut: [] }>()
</script>

<template>
  <!-- 帯がごく狭いときは中でも折り返す（UT-32）。これ以上縮まない塊にしない -->
  <div class="flex flex-wrap items-center gap-7">
    <!--
      拡大縮小のボタン（UT-28 / M-11）。トラックパッドが無いとき（ポインタ以外）でも
      拡大縮小できるようにする。上下限に当たっていれば押せない（倍率の表示と同じく、
      効かないのか限界なのかを区別できるように）。

      **`disabled` にはしない。** キーボードで押し続けて限界に達したとき、押していた
      ボタンが `disabled` になると焦点が文書の先頭へ落ち、ツールバーでの位置を失う。
      `aria-disabled` で押せないことを伝え、押しても何もしない
    -->
    <button
      type="button"
      class="rounded-control px-6 py-4 text-ui text-ink-2 not-aria-disabled:hover:bg-surface-2 not-aria-disabled:hover:text-ink aria-disabled:cursor-default aria-disabled:text-line"
      :aria-disabled="scale <= MIN_SCALE"
      aria-label="縮小"
      title="縮小"
      @click="scale > MIN_SCALE && $emit('zoomOut')"
    >
      −
    </button>

    <span class="w-44 text-center font-mono text-caption text-ink-3 tabular-nums">
      <span class="sr-only">拡大率</span>{{ Math.round(scale * 100) }}%
    </span>

    <button
      type="button"
      class="rounded-control px-6 py-4 text-ui text-ink-2 not-aria-disabled:hover:bg-surface-2 not-aria-disabled:hover:text-ink aria-disabled:cursor-default aria-disabled:text-line"
      :aria-disabled="scale >= MAX_SCALE"
      aria-label="拡大"
      title="拡大"
      @click="scale < MAX_SCALE && $emit('zoomIn')"
    >
      ＋
    </button>

    <button
      type="button"
      class="rounded-control px-8 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
      aria-label="全体を表示"
      title="全体を表示"
      @click="$emit('fit')"
    >
      ⤢
    </button>

    <button
      type="button"
      class="rounded-control px-8 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:text-line disabled:hover:bg-transparent"
      :disabled="movedCount === 0"
      :aria-label="`配置を戻す（手で動かしたノード ${movedCount} 件）`"
      title="配置を戻す"
      @click="$emit('resetPositions')"
    >
      ↺
    </button>
  </div>
</template>
