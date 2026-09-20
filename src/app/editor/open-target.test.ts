import { describe, expect, it } from 'vitest'

import type { FileNode, GraphNode } from '@/core/graph/schema'
import { openTargetOf } from './open-target'

const file: FileNode = {
  id: 'f:src/app.ts',
  kind: 'file',
  name: 'app.ts',
  path: 'src/app.ts',
}

const method: GraphNode = {
  id: 'm:src/app.ts#run',
  kind: 'method',
  parent: file.id,
  name: 'run',
  owner: 'App',
  ownerKind: 'class',
  loc: { line: 42, column: 7 },
}

const found = (node: FileNode) => () => node
const nothing = () => undefined

describe('開く先を決める（UT-18 / US-19）', () => {
  it('ファイルノードは、自分のパスで開く', () => {
    expect(openTargetOf(file, nothing)).toEqual({ path: 'src/app.ts' })
  })

  it('ファイルノードは行を指定しない', () => {
    // 先頭を指すと「こちらが決めた位置」になる。前回の位置で開かせる（UT-18 の決定）
    const target = openTargetOf(file, nothing)

    expect(target).toBeDefined()
    expect(target?.loc).toBeUndefined()
  })

  it('メソッドノードは、所属ファイルのパスと自分の位置で開く', () => {
    // メソッドは `path` を持たない。所属ファイルを引かないと開く先が決まらない
    expect(openTargetOf(method, found(file))).toEqual({
      path: 'src/app.ts',
      loc: { line: 42, column: 7 },
    })
  })

  it('所属ファイルが引けなければ、決められないと返す', () => {
    // 正本 JSON がそう言っているだけで、ビューアが直せるものではない（N-1）
    expect(openTargetOf(method, nothing)).toBeUndefined()
  })
})
