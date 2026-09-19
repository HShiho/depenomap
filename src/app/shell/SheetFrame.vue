<script setup lang="ts">
/**
 * 画面全体に重なるシートの枠（UT-13 の概要、UT-19 の追跡できなかった依存）。
 *
 * 中身は違っても、**重なりとして守ることは同じ**。UT-13 の 3 ラウンドで出た
 * 手当てをここに集める。
 *
 *   - 背景の覆いを押すと閉じる。シートの外を押して閉じられないと、レールの
 *     ボタンまで戻らないと閉じられない
 *   - **開いたら焦点を引き取る。** 裏は `inert`（`AppShell`）なので、焦点が
 *     裏に残ると行き場が無くなり、Tab が文書の先頭へ飛ぶ
 *   - 閉じる口を必ず持つ
 *
 * 閉じたあとに焦点を返すのは開く側（`use-sheet.ts`）。押した口を覚えられるのは
 * そちらだけで、ここでは裏が `inert` になったあとの値しか読めない。
 */
import { onMounted, useTemplateRef } from 'vue'

defineProps<{
  /** 読み上げ名。何のシートかが分かる言い方にする */
  label: string
  /** 閉じる口の読み上げ名。開く口（レール）と対になる言い方にする */
  closeLabel: string
}>()

const emit = defineEmits<{ close: [] }>()

const sheet = useTemplateRef<HTMLElement>('sheet')

onMounted(() => sheet.value?.focus())
</script>

<template>
  <div
    class="fixed inset-0 z-10 flex justify-center bg-ground/70 p-24 backdrop-blur-[2px]"
    @click.self="emit('close')"
  >
    <section
      ref="sheet"
      class="flex max-h-full w-full max-w-[900px] flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-float focus:outline-none"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
    >
      <header class="flex shrink-0 items-start gap-9 border-b border-line px-16 py-12">
        <div class="min-w-0">
          <slot name="header" />
        </div>

        <div class="grow"></div>

        <button
          type="button"
          class="rounded-control px-6 py-2 leading-none text-ink-3 hover:bg-surface-2 hover:text-ink"
          :aria-label="closeLabel"
          title="閉じる"
          @click="emit('close')"
        >
          ✕
        </button>
      </header>

      <div class="min-h-0 grow overflow-y-auto px-16 py-14">
        <slot />
      </div>
    </section>
  </div>
</template>
