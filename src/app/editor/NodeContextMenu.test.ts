// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import NodeContextMenu from './NodeContextMenu.vue'
import type { OpenAction } from './open-action'

enableAutoUnmount(afterEach)

afterEach(() => vi.restoreAllMocks())

const ready: OpenAction = {
  kind: 'ready',
  uri: 'vscode://file/Users/me/app/src/a.ts',
  hostPath: '/Users/me/app/src/a.ts',
}

function show(action: OpenAction = ready) {
  return mount(NodeContextMenu, {
    props: { at: { x: 120, y: 80 }, title: 'app.ts', subtitle: 'src/app.ts', action },
    attachTo: document.body,
  })
}

const item = (wrapper: ReturnType<typeof show>) => wrapper.get('[role="menuitem"]')

describe('ノードの右クリックメニュー（UT-18 / US-19）', () => {
  it('開く導線を出す', () => {
    expect(item(show()).text()).toContain('VSCode で開く')
  })

  it('どのノードのメニューかを出す', () => {
    // 図の上では、押した先がメニューに隠れる
    const wrapper = show()

    expect(wrapper.text()).toContain('app.ts')
    expect(wrapper.text()).toContain('src/app.ts')
  })

  it('開ける先をリンクとして書く', () => {
    // vscode:// を OS へ取り次ぐのはブラウザ。こちらは行き先を書くだけでよい
    expect(item(show()).attributes('href')).toBe('vscode://file/Users/me/app/src/a.ts')
  })

  it('押すと、開いたことを伝える', async () => {
    const wrapper = show()

    await item(wrapper).trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('開けないときは、行き先を書かない', () => {
    // 押せる見た目のまま行き先だけ無い、という形を作らない
    const wrapper = show({ kind: 'blocked', reason: 'x' })

    expect(item(wrapper).attributes('href')).toBeUndefined()
  })

  it('押した場所に出す', () => {
    // jsdom では大きさを測れない（0）ので、押した場所のまま出る
    expect(show().attributes('style')).toContain('left: 120px')
  })

  it('開けないときも項目は出し、押せなくする', () => {
    // 出さないと「この画面には開く機能が無い」と読める
    const wrapper = show({ kind: 'blocked', reason: '解析対象リポジトリが渡されていない' })

    expect(item(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('解析対象リポジトリが渡されていない')
  })

  it('押せないときは、押しても開かない', async () => {
    const wrapper = show({ kind: 'blocked', reason: 'x' })

    await item(wrapper).trigger('click')

    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('問い合わせ中は、その旨を出して押せなくする', () => {
    const wrapper = show({ kind: 'asking' })

    expect(item(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('確認中')
  })

  it('開いたら焦点を引き取る', () => {
    // 右クリックでは焦点が動かない。引き取らないと Esc が届かない
    const wrapper = show()

    expect(document.activeElement).toBe(wrapper.element)
  })

  it('Esc で閉じる', async () => {
    const wrapper = show()

    await wrapper.trigger('keydown.esc')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('外側を押すと閉じる', async () => {
    const wrapper = show()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('メニューの中を押しても閉じない', async () => {
    const wrapper = show()

    await item(wrapper).trigger('pointerdown')

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('図を動かしたら閉じる', async () => {
    // メニューは押した瞬間の 1 点に出る。下の図が動くと別のノードを指す
    const wrapper = show()

    window.dispatchEvent(new WheelEvent('wheel'))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('畳むときに、窓につけた聞き耳をすべて外す', () => {
    /*
     * 外れずに残った聞き耳は、次に出したメニューまで巻き込んで閉じる。
     * **畳んだあとに発火させても観測できない**（Vue は畳んだ実体の emit を
     * 記録しない）ので、付けたものと外したものを突き合わせる
     */
    const added = vi.spyOn(window, 'addEventListener')
    const removed = vi.spyOn(window, 'removeEventListener')

    const wrapper = show()
    const attached = added.mock.calls.filter(([type]) => type === 'pointerdown' || type === 'wheel')
    wrapper.unmount()

    expect(attached).toHaveLength(2)
    for (const call of attached) expect(removed).toHaveBeenCalledWith(...call)
  })
})
