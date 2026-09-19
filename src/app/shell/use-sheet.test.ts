// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { useSheets } from './use-sheet'

/**
 * 取り決めを直接確かめる。
 *
 * これが壊れると、載っているシートが**すべて**同じ形で壊れる。シートごとの
 * 検査に任せると、片方にしか無い取り決めが生まれる（UT-19 で実際に起きた）。
 */
function setup(ready = ref(true)) {
  const sheets = useSheets<'a' | 'b'>(() => ready.value)
  const button = document.createElement('button')
  document.body.append(button)
  const event = { currentTarget: button } as unknown as MouseEvent

  // `watch` を動かすため、描画の文脈に載せる
  const wrapper = mount(
    defineComponent({ setup: () => () => h('div', String(sheets.shown.value)) }),
  )

  return { sheets, ready, button, event, wrapper }
}

describe('重なるシートの開閉（UT-13 / UT-19）', () => {
  it('開くまでは、何も出ていない', () => {
    expect(setup().sheets.shown.value).toBeUndefined()
  })

  it('開いたものが出る', () => {
    const { sheets, event } = setup()

    sheets.open('a', event)

    expect(sheets.shown.value).toBe('a')
  })

  it('出せるのは 1 枚だけ', () => {
    // 重ねると、裏のシートが触れないまま残る
    const { sheets, event } = setup()
    sheets.open('a', event)

    sheets.open('b', event)

    expect(sheets.shown.value).toBe('b')
  })

  it('読めない状態では出さない', () => {
    // 「出ているか」と「開いているか」を 1 つの式にする
    const ready = ref(false)
    const { sheets, event } = setup(ready)

    sheets.open('a', event)

    expect(sheets.shown.value).toBeUndefined()
  })

  it('読めなくなったら、開いていたことも倒す', async () => {
    // 隠れているあいだは閉じる操作も効かない。戻った瞬間に独りでに出てしまう
    const ready = ref(true)
    const { sheets, event } = setup(ready)
    sheets.open('a', event)

    ready.value = false
    await nextTick()
    ready.value = true
    await nextTick()

    expect(sheets.shown.value).toBeUndefined()
  })

  it('閉じると、開いた口へ焦点が戻る', async () => {
    // 裏は `inert` なので、焦点が裏に残ると行き場が無くなる
    const { sheets, button, event } = setup()
    sheets.open('a', event)
    expect(document.activeElement).not.toBe(button)

    sheets.close()
    await nextTick()

    expect(document.activeElement).toBe(button)
  })

  it('押した口が無くても壊れない', async () => {
    const { sheets } = setup()

    sheets.open('a', { currentTarget: null } as unknown as MouseEvent)
    sheets.close()
    await nextTick()

    expect(sheets.shown.value).toBeUndefined()
  })
})
