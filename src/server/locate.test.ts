import { describe, expect, it } from 'vitest'

import type { RepoMount } from './config'
import { locate } from './locate'

const repo: RepoMount = { hostPath: '/Users/me/app', mountPath: '/repo' }

/** 「ここには実体がある」と答える確かめ方 */
const found = (paths: string[]) => (path: string) => paths.includes(path)
const nothing = () => false

describe('ホスト側の位置を求める（UT-20 / ADR-004）', () => {
  it('ホストから見た絶対パスを返す', () => {
    // エディタへ渡すのはホスト側。コンテナの中の位置を渡しても開けない
    const result = locate(repo, 'src/a.ts', nothing)

    expect(result).toEqual({
      resolved: true,
      hostPath: '/Users/me/app/src/a.ts',
      exists: false,
    })
  })

  it('存在は、このプロセスから見える側で確かめる', () => {
    // マウント先にしか実体は無い。ホスト側のパスはこのプロセスからは開けない
    const result = locate(repo, 'src/a.ts', found(['/repo/src/a.ts']))

    expect(result).toEqual({
      resolved: true,
      hostPath: '/Users/me/app/src/a.ts',
      exists: true,
    })
  })

  it('実体が無くても、位置は返す', () => {
    // 無いことを欠陥として扱わない（N-1）。移動した・まだ無い、どちらもありうる
    const result = locate(repo, 'src/gone.ts', nothing)

    expect(result.resolved).toBe(true)
    expect(result.resolved && result.exists).toBe(false)
  })

  it('リポジトリが渡されていなければ、その旨を返す', () => {
    // 図を読むだけなら要らない。何が足りないかは呼び出し側が案内する
    expect(locate(undefined, 'src/a.ts', nothing)).toEqual({
      resolved: false,
      reason: 'no-repo',
    })
  })

  it('マウント先とホスト側が同じでも成立する', () => {
    // Docker を経由せずに動かすとき
    const same: RepoMount = { hostPath: '/w/app', mountPath: '/w/app' }

    expect(locate(same, 'src/a.ts', found(['/w/app/src/a.ts']))).toEqual({
      resolved: true,
      hostPath: '/w/app/src/a.ts',
      exists: true,
    })
  })

  it('`./` を含む形も畳む', () => {
    expect(locate(repo, './src/./a.ts', nothing)).toMatchObject({
      hostPath: '/Users/me/app/src/a.ts',
    })
  })

  it.each([
    ['絶対パス', '/etc/passwd'],
    ['リポジトリの外へ出る', '../secret.txt'],
    ['畳むと外へ出る', 'src/../../secret.txt'],
    ['空', ''],
  ])('%s は受け取らない', (_label, path) => {
    // 正本 JSON の中身は検査しない立場（N-1）なので、受け取る側で線を引く
    expect(locate(repo, path, nothing)).toEqual({ resolved: false, reason: 'bad-path' })
  })

  it('リポジトリの中に戻る形は受け取る', () => {
    expect(locate(repo, 'src/x/../a.ts', nothing)).toMatchObject({
      hostPath: '/Users/me/app/src/a.ts',
    })
  })
})
