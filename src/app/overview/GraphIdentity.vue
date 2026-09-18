<script setup lang="ts">
/**
 * このグラフの素性（UT-13 / US-11）。
 *
 * どのコードベースの、いつの、どの断面を見ているのか。図を読む前提であり、
 * これが読めないと、画面に出ている構造が何の構造なのか確かめられない。
 *
 * **commit は全文を出す。** 見出し側は短く見せるが、確かめにくるのはこの表
 * なので、ここで切ると確かめる先が無くなる。
 */
import type { Meta } from '@/core/graph/schema'
import { formatGeneratedAt } from './overview-format'

const props = defineProps<{ meta: Meta }>()

const rows = [
  { label: 'スナップショット', value: () => props.meta.snapshot.label },
  { label: 'ブランチ', value: () => props.meta.snapshot.branch },
  { label: 'コミット', value: () => props.meta.snapshot.commit },
  { label: '生成日時', value: () => formatGeneratedAt(props.meta.generatedAt) },
  { label: 'tsconfig', value: () => props.meta.tsconfig },
  { label: 'rootDir', value: () => props.meta.rootDir },
]
</script>

<template>
  <table class="w-full border-collapse text-meta">
    <tbody>
      <tr v-for="row in rows" :key="row.label" class="border-b border-line-2 last:border-b-0">
        <th scope="row" class="w-[140px] py-6 pr-10 text-left font-normal text-ink-3">
          {{ row.label }}
        </th>
        <td class="min-w-0 py-6 font-mono break-all text-ink-2">{{ row.value() }}</td>
      </tr>
    </tbody>
  </table>
</template>
