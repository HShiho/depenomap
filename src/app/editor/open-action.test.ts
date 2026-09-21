import { describe, expect, it } from 'vitest'

import type { FetchLocateOutcome, LocateResult } from '@/core/graph/api'
import { openActionOf } from './open-action'
import type { OpenTarget } from './open-target'

const target: OpenTarget = { path: 'src/a.ts' }
const withLoc: OpenTarget = { path: 'src/a.ts', loc: { line: 42, column: 7 } }

/** 口に届いて、この結果が返ってきた */
const located = (result: LocateResult): FetchLocateOutcome => ({ reached: true, result })

const here: FetchLocateOutcome = {
  reached: true,
  result: { resolved: true, hostPath: '/Users/me/app/src/a.ts', exists: true },
}

describe('開く導線の状態（UT-18 / US-19）', () => {
  it('位置が決まれば、その URI で開ける', () => {
    expect(openActionOf(target, here)).toEqual({
      kind: 'ready',
      uri: 'vscode://file/Users/me/app/src/a.ts',
      hostPath: '/Users/me/app/src/a.ts',
    })
  })

  it('メソッドの位置は URI に載せる', () => {
    expect(openActionOf(withLoc, here)).toMatchObject({
      uri: 'vscode://file/Users/me/app/src/a.ts:42:7',
    })
  })

  it('返事を待っているあいだは、問い合わせ中として扱う', () => {
    expect(openActionOf(target, undefined)).toEqual({ kind: 'asking' })
  })

  it('開く先が決まらなければ、その旨を出す', () => {
    // メソッドの所属ファイルが正本 JSON に無い場合。問い合わせるまでもない
    const action = openActionOf(undefined, here)

    expect(action.kind).toBe('blocked')
    expect(action.kind === 'blocked' && action.reason).toContain('所属ファイル')
  })

  it('リポジトリが渡されていなければ、何が足りないかを出す', () => {
    // 図を読むだけなら要らない。欠陥として扱わない（N-1）
    const action = openActionOf(target, located({ resolved: false, reason: 'no-repo' }))

    expect(action.kind).toBe('blocked')
    expect(action.kind === 'blocked' && action.reason).toContain('--repo')
  })

  it('パスから位置を決められなければ、そのパスを添える', () => {
    const action = openActionOf(target, located({ resolved: false, reason: 'bad-path' }))

    expect(action.kind === 'blocked' && action.reason).toContain('src/a.ts')
  })

  it('サーバーに届かなければ、解決できなかったことと区別して出す', () => {
    const action = openActionOf(target, { reached: false, message: 'ECONNREFUSED' })

    expect(action.kind === 'blocked' && action.reason).toContain('ECONNREFUSED')
  })

  it('実体が無ければ開かせない', () => {
    /*
     * VSCode は無いファイルを開こうとすると空のエディタを作る。それが正本
     * JSON の言うファイルなのか、いま作られた空のものなのかが区別できない
     */
    const action = openActionOf(
      target,
      located({ resolved: true, hostPath: '/Users/me/app/src/a.ts', exists: false }),
    )

    expect(action.kind).toBe('blocked')
    expect(action.kind === 'blocked' && action.reason).toContain('/Users/me/app/src/a.ts')
  })
})
